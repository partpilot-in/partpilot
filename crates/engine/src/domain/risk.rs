#[derive(Debug, Clone, Copy, PartialEq)]
pub struct RiskScore {
    pub value: f32,
    pub band: RiskBand,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RiskBand {
    Low,
    Medium,
    High,
    Critical,
}
