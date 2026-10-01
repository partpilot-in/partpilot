# Security Policy

PartPilot handles hardware engineering and component data, so security issues should be reported privately.

## Reporting a vulnerability

Please **do not open a public GitHub issue** for a suspected vulnerability, exposed credential, authentication bypass, or customer-data issue.

Contact the PartPilot maintainers privately at **tirrek.payne@bestpartpilot.com** with:

- a short description of the issue
- affected component or endpoint
- steps to reproduce, if available
- potential impact
- any suggested mitigation

Please avoid including real customer data or credentials in the report.

## Sensitive data

Do not commit:

- production API keys or tokens
- database credentials
- customer BOMs or procurement data
- private manufacturer/vendor data
- authentication secrets
- proprietary engine configuration or customer-specific decision context

Example environment files must use placeholder values only.

## Scope

PartPilot is under active development. Security-sensitive production behavior should not rely on placeholder or fixture implementations. Authentication and authorization must be implemented and tested before an endpoint is used for real customer data.
