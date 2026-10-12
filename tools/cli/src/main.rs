mod api;
mod bom;
mod output;

use anyhow::{Result, bail};
use api::{Api, Part};
use clap::{Parser, Subcommand};
use std::{
    collections::HashMap,
    io::{self, Write},
    path::PathBuf,
    process::ExitCode,
};

#[derive(Parser)]
#[command(
    name = "partpilot",
    version,
    about = "Inspect electronic parts and analyse BOM lifecycle and compliance"
)]
struct Cli {
    #[arg(
        long,
        global = true,
        env = "PARTPILOT_API_URL",
        default_value = "https://api.bestpartpilot.com"
    )]
    api_url: String,
    /// Request timeout in seconds
    #[arg(long, global = true, default_value_t = 60, value_parser = clap::value_parser!(u64).range(1..))]
    timeout: u64,
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Search a part number and show lifecycle, compliance and all returned part data
    Scan {
        query: String,
        #[arg(long, short)]
        manufacturer: Option<String>,
        #[arg(long, default_value_t = 10, value_parser = clap::value_parser!(u8).range(1..=100))]
        limit: u8,
    },
    /// Analyse a CSV or the first worksheet of an XLSX BOM
    #[command(alias = "analyze")]
    Analyse { file: PathBuf },
}

fn run(cli: Cli) -> Result<bool> {
    let api = Api::new(&cli.api_url, cli.timeout)?;
    let (text, success) = match cli.command {
        Command::Scan {
            query,
            manufacturer,
            limit,
        } => {
            if api::normalized(&query).is_empty() {
                bail!("Enter a part number or search term");
            }
            let parts = api.search(
                query.trim(),
                manufacturer.as_deref().unwrap_or(""),
                limit as usize,
            )?;
            if parts.is_empty() {
                (
                    format!("No parts found for {}.\n", output::clean(&query)),
                    false,
                )
            } else {
                (
                    format!(
                        "{} result(s) for {}\n\n{}",
                        parts.len(),
                        output::clean(&query),
                        output::scan(&parts)
                    ),
                    true,
                )
            }
        }
        Command::Analyse { file } => {
            let lines = bom::read(&file)?;
            eprintln!("Analysing {} BOM line(s)...", lines.len());
            let mut cache: HashMap<(String, String), std::result::Result<Vec<Part>, String>> =
                HashMap::new();
            let mut table = output::table(&[
                "Row / Ref",
                "Qty",
                "Requested MPN",
                "Matched MPN / Manufacturer",
                "Lifecycle",
                "RoHS",
                "REACH",
                "Result",
            ]);
            let (mut matched, mut unresolved, mut failed) = (0, 0, 0);
            for line in &lines {
                let key = (line.mpn.clone(), line.manufacturer.clone());
                let results = cache.entry(key).or_insert_with(|| {
                    api.search(&line.mpn, &line.manufacturer, 100)
                        .map_err(|e| format!("{e:#}"))
                });
                let mut values = vec![
                    format!("{} {}", line.row, output::clean(&line.designator))
                        .trim()
                        .to_owned(),
                    line.qty.clone(),
                    output::clean(&line.mpn),
                ];
                let (part, status) = match results {
                    Err(error) => {
                        failed += 1;
                        eprintln!(
                            "Row {} ({}): {}",
                            line.row,
                            output::clean(&line.mpn),
                            output::clean(error)
                        );
                        (None, "API error")
                    }
                    Ok(parts) => {
                        let exact: Vec<_> = parts
                            .iter()
                            .filter(|p| api::matches(p, &line.mpn))
                            .collect();
                        if exact.len() == 1 {
                            matched += 1;
                            (Some(exact[0]), "Matched")
                        } else {
                            unresolved += 1;
                            (
                                None,
                                if exact.len() > 1 {
                                    "Ambiguous"
                                } else if parts.is_empty() {
                                    "Not found"
                                } else {
                                    "Similar only"
                                },
                            )
                        }
                    }
                };
                if let Some(part) = part {
                    values.push(format!(
                        "{} / {}",
                        output::clean(&part.mpn),
                        output::clean(&part.manufacturer)
                    ));
                    values.extend(output::summary(part).into_iter().skip(2));
                } else {
                    values.extend(["—", "Unknown", "Unknown", "Unknown"].map(str::to_owned));
                }
                values.push(status.into());
                table.add_row(values);
            }
            (
                format!(
                    "BOM: {}\n\n{table}\n\n{} lines: {matched} matched, {unresolved} unresolved, {failed} API errors.\nUnknown means the API did not provide that value. Use `partpilot scan <MPN>` for full details.\n",
                    output::clean(&file.display().to_string()),
                    lines.len()
                ),
                unresolved == 0 && failed == 0,
            )
        }
    };
    io::stdout().lock().write_all(text.as_bytes())?;
    Ok(success)
}

fn main() -> ExitCode {
    match run(Cli::parse()) {
        Ok(true) => ExitCode::SUCCESS,
        Ok(false) => ExitCode::from(1),
        Err(error) => {
            if error
                .downcast_ref::<io::Error>()
                .is_some_and(|e| e.kind() == io::ErrorKind::BrokenPipe)
            {
                return ExitCode::SUCCESS;
            }
            eprintln!("Error: {}", output::clean(&format!("{error:#}")));
            ExitCode::from(1)
        }
    }
}
