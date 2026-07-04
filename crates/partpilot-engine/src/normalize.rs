use std::collections::HashMap;

use crate::domain::{NormalizedManufacturer, NormalizedMpn};

#[derive(Debug, Clone, Default)]
pub struct AliasTable(HashMap<String, NormalizedManufacturer>);

impl AliasTable {
    pub fn new(aliases: HashMap<String, NormalizedManufacturer>) -> Self {
        Self(aliases)
    }

    pub fn resolve(&self, upper_trimmed: &str) -> Option<NormalizedManufacturer> {
        self.0.get(upper_trimmed).cloned()
    }

    pub fn insert_alias(
        &mut self,
        alias: impl Into<String>,
        canonical: impl Into<String>,
    ) -> Option<NormalizedManufacturer> {
        self.0.insert(
            canonicalize_alias_key(&alias.into()),
            NormalizedManufacturer(canonicalize_alias_key(&canonical.into())),
        )
    }

    pub fn seed_default() -> Self {
        let mut table = Self::default();
        table.insert_alias("TI", "TEXAS INSTRUMENTS");
        table.insert_alias("TI INC.", "TEXAS INSTRUMENTS");
        table.insert_alias("TEXAS INSTRUMENTS", "TEXAS INSTRUMENTS");
        table.insert_alias("TEXAS INSTRUMENTS INC", "TEXAS INSTRUMENTS");
        table.insert_alias("TEXAS INSTRUMENTS INC.", "TEXAS INSTRUMENTS");
        table.insert_alias("TEXAS INSTRUMENTS INCORPORATED", "TEXAS INSTRUMENTS");
        table.insert_alias("ADI", "ANALOG DEVICES");
        table.insert_alias("ANALOG DEVICES INC", "ANALOG DEVICES");
        table.insert_alias("ANALOG DEVICES INC.", "ANALOG DEVICES");
        table.insert_alias("STMICROELECTRONICS", "STMICROELECTRONICS");
        table.insert_alias("ST MICROELECTRONICS", "STMICROELECTRONICS");
        table
    }
}

pub fn normalize_mpn(raw: &str) -> NormalizedMpn {
    let cleaned: String = raw
        .trim()
        .to_uppercase()
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '-')
        .collect();
    NormalizedMpn(cleaned)
}

pub fn normalize_manufacturer(raw: &str, alias_table: &AliasTable) -> NormalizedManufacturer {
    let trimmed = canonicalize_alias_key(raw);
    alias_table
        .resolve(&trimmed)
        .unwrap_or(NormalizedManufacturer(trimmed))
}

fn canonicalize_alias_key(raw: &str) -> String {
    raw.trim().to_uppercase()
}

#[cfg(test)]
mod tests {
    use super::{normalize_manufacturer, normalize_mpn, AliasTable};

    #[test]
    fn normalizes_mpn_for_matching() {
        assert_eq!(normalize_mpn("  lm1117-3.3/nopb ").0, "LM1117-33NOPB");
        assert_eq!(normalize_mpn("RC 0603 10k").0, "RC060310K");
    }

    #[test]
    fn resolves_common_manufacturer_aliases() {
        let aliases = AliasTable::seed_default();
        let cases = [
            ("Texas Instruments Incorporated", "TEXAS INSTRUMENTS"),
            ("TI Inc.", "TEXAS INSTRUMENTS"),
            ("texas instruments", "TEXAS INSTRUMENTS"),
            ("ST Microelectronics", "STMICROELECTRONICS"),
            ("Unknown Parts Co", "UNKNOWN PARTS CO"),
        ];

        for (raw, expected) in cases {
            assert_eq!(normalize_manufacturer(raw, &aliases).0, expected);
        }
    }
}
