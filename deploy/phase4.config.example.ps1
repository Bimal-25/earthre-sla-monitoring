# Copy this file to deploy/phase4.config.ps1 and edit the values.
# deploy/phase4.config.ps1 is intentionally gitignored.

# Globally unique Google Cloud / Firebase project ID.
$ProjectId = "YOUR_GCP_PROJECT_ID"

# Human-friendly project name used only if you choose to create the project.
$ProjectDisplayName = "EarthRe SLA Monitor"

# Set true only if the deployment script should create the GCP project when absent.
# Most reviewers should create/select the project in the console first and keep this false.
$CreateProjectIfMissing = $false

# Keep API and Firestore colocated when possible.
# Firestore location is permanent after database creation, so review it carefully.
$Region = "us-central1"
$FirestoreLocation = "us-central1"

# Cloud Run function-style service.
$ApiServiceName = "earthre-sla-api"
$RuntimeServiceAccountName = "earthre-sla-api"

# Cost/scaling guardrails for this take-home.
$MinInstances = 0
$MaxInstances = 2
$Concurrency = 4
$Cpu = "1"
$Memory = "512Mi"
$Timeout = "300s"

# Application configuration.
$MaxUploadBytes = 5242880
$MaxCsvRows = 25000
$DefaultPageSize = 100
$MaxPageSize = 250
$SlaTargetPercent = 99.9
