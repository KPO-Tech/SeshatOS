import type { Gallery } from './types'

export const CLOUD: Gallery = {
  id: 'cloud',
  title: 'Cloud architectures',
  description: 'Systems drawn with the logos of the services they use: AWS, Kubernetes, Kafka and others.',
  tone: 'orange',
  icon: 'cloud',
  examples: [
    {
      title: 'A data fabric',
      about: 'A poster: sources, a lakehouse in three stages, consumption.',
      code: `root = Architecture([main, meta, catalog], [f1, f2, f3, f4], "Data fabric architecture", "column", true)
main = Panel([sources, lake, use], null, "neutral", null, false, "row")
sources = Panel([erp, crm, hr, mdm], "Source systems", "teal", null, false, "column")
erp = Item("ERP system", null, null, true, "teal", "cylinder")
crm = Item("CRM system", null, null, true, "teal", "cylinder")
hr = Item("HR system", null, null, true, "teal", "cylinder")
mdm = Item("MDM system", null, null, true, "teal", "cylinder")
lake = Panel([staging, core, delivery], "Data lakehouse", "violet", null, false, "row")
staging = Panel([stage], "Staging", "neutral", null, false, "column")
stage = Item("Data lake", "cloud", null, true)
core = Panel([warehouse], "Enterprise data warehouse", "neutral", null, false, "column")
warehouse = Item("Core", "database", null, true)
delivery = Panel([m1, m2, m3, m4], "Information delivery", "neutral", null, false, "column")
m1 = Item("Information marts", null, null, true, "violet", "cylinder")
m2 = Item("Data marts", null, null, true, "violet", "cylinder")
m3 = Item("AI marts", null, null, true, "violet", "cylinder")
m4 = Item("User marts", null, null, true, "violet", "cylinder")
use = Panel([app, dash, cube], "Data consumption", "green", null, false, "column")
app = Item("Application", "phone", null, true)
dash = Item("Dashboard", "dashboard", null, true)
cube = Item("OLAP cube", null, null, true, "violet", "cylinder")
meta = Panel([mi], null, "orange", null, true, "column")
mi = Item("Metadata management to drive automation", "setting")
catalog = Panel([ci], null, "orange", null, true, "column")
ci = Item("Data catalog, AI augmented", "ai")
f1 = Flow("sources", "staging", null, false, "block")
f2 = Flow("staging", "core", null, false, "block")
f3 = Flow("core", "delivery", null, false, "block")
f4 = Flow("lake", "use", null, false, "block")`
    },
    {
      title: 'Steps as hexagons',
      about: 'Items as hexagons and pills, a database as a cylinder with its icon.',
      code: `root = Architecture([a, b, c], [f1, f2], "A release, in shapes", "row")
a = Panel([s1, s2], "Build", "blue", null, false, "column")
s1 = Item("Compile", "code", null, false, "blue", "hexagon")
s2 = Item("Test", "check", null, false, "teal", "hexagon")
b = Panel([s3, s4], "Ship", "violet", null, false, "column")
s3 = Item("Image", "box", null, false, "violet", "pill")
s4 = Item("Rollout", "rocket", null, false, "orange", "pill")
c = Panel([db], "State", "green", null, false, "column")
db = Item("Releases", "database", "PostgreSQL", false, "green", "cylinder")
f1 = Flow("a", "b", null, false, "block")
f2 = Flow("b", "c", null, false, "block")`
    },
    {
      title: 'An ETL pipeline',
      about: 'Stages in a row with big arrows between them.',
      code: `root = Architecture([src, etl, wh, bi], [f1, f2, f3], "Orders pipeline", "row")
src = Panel([a, b], "Sources", "blue", null, false, "column")
a = Item("Orders", null, "PostgreSQL", true, "blue", "cylinder")
b = Item("Payments", null, "Stripe", true, "blue", "cylinder")
etl = Panel([clean, join], "Transform", "orange", "workflow", false, "column")
clean = Item("Clean", "filter", "Types, duplicates", true)
join = Item("Join", "transform", "Orders and payments", true)
wh = Panel([store], "Warehouse", "violet", null, false, "column")
store = Item("Facts", null, "Snowflake", true, "violet", "cylinder")
bi = Panel([dash], "Reports", "green", "chart", false, "column")
dash = Item("Dashboards", "dashboard", "Grafana", true)
f1 = Flow("src", "etl", null, false, "block")
f2 = Flow("etl", "wh", null, false, "block")
f3 = Flow("wh", "bi", null, false, "block")`
    },
    {
      title: 'A RAG chatbot on AWS',
      about: 'Documents in S3, a Lambda that indexes, a vector database.',
      code: `root = Architecture([users, app, knowledge], [f1, f2, f3, f4, f5], "RAG chatbot on AWS")
users = Panel([web], "Users", "violet", "monitor", false, "row")
web = Item("Web app", "react", "Chat UI", true)
app = Panel([api, fn, llm], "Application", "orange", "cloud", false, "row")
api = Item("API Gateway", "aws api gateway", "HTTPS", true)
fn = Item("Lambda", "aws lambda", "Retrieve and answer", true)
llm = Item("Model", "openai", "Generation", true)
knowledge = Panel([docs, indexer, vectors], "Knowledge", "blue", "database", true, "row")
docs = Item("S3", "aws s3", "Documents", true)
indexer = Item("Indexer", "aws lambda", "Chunks and embeds", true)
vectors = Item("Vector DB", "postgresql", "pgvector", true)
f1 = Flow("web", "api", "question")
f2 = Flow("api", "fn")
f3 = Flow("fn", "vectors", "search")
f4 = Flow("fn", "llm", "prompt")
f5 = Flow("docs", "indexer", "new file")`
    },
    {
      title: 'A CI/CD pipeline',
      about: 'From a commit to a running cluster.',
      code: `root = Architecture([code, build, release, run], [f1, f2, f3, f4, f5], "From commit to cluster")
code = Panel([repo], "Code", "violet", "folder", false, "row")
repo = Item("GitHub", "github", "Pull requests", true)
build = Panel([ci, unit, e2e], "Build", "orange", "workflow", false, "row")
ci = Item("Actions", "github actions", "Workflow", true)
unit = Item("Jest", "jest", "Unit tests", true)
e2e = Item("Cypress", "cypress", "End to end", true)
release = Panel([image, infra], "Release", "blue", "box", false, "row")
image = Item("Docker", "docker", "Image", true)
infra = Item("Terraform", "terraform", "Infrastructure", true)
run = Panel([k8s, watch], "Run", "green", "server", false, "row")
k8s = Item("Kubernetes", "kubernetes", "Rolling update", true)
watch = Item("Grafana", "grafana", "Dashboards", true)
f1 = Flow("repo", "ci", "push")
f2 = Flow("ci", "unit")
f3 = Flow("ci", "image", "build")
f4 = Flow("image", "k8s", "deploy")
f5 = Flow("infra", "k8s")`
    },
    {
      title: 'An event-driven backend',
      about: 'Events, queues and functions.',
      code: `root = Architecture([sources, bus, work, store], [f1, f2, f3, f4, f5], "Orders, by events")
sources = Panel([shop, pay], "Sources", "violet", "monitor", false, "row")
shop = Item("Shop", "nextjs", "Orders", true)
pay = Item("Stripe", "stripe", "Payments", true)
bus = Panel([events, queue], "Bus", "orange", "workflow", false, "row")
events = Item("EventBridge", "aws eventbridge", "Routing", true)
queue = Item("SQS", "aws sqs", "Buffer", true)
work = Panel([fn, notify], "Work", "blue", "bolt", false, "row")
fn = Item("Lambda", "aws lambda", "Fulfil", true)
notify = Item("SNS", "aws sns", "Notify", true)
store = Panel([table], "State", "green", "database", false, "row")
table = Item("DynamoDB", "aws dynamodb", "Orders", true)
f1 = Flow("shop", "events")
f2 = Flow("pay", "events")
f3 = Flow("events", "queue")
f4 = Flow("queue", "fn")
f5 = Flow("fn", "table")`
    },
    {
      title: 'A data platform',
      about: 'Sources to warehouse to dashboards.',
      code: `root = Architecture([sources, ingest, warehouse, serve], [f1, f2, f3, f4], "Data platform")
sources = Panel([app, saas], "Sources", "violet", "database", false, "row")
app = Item("PostgreSQL", "postgresql", "Product data", true)
saas = Item("Stripe", "stripe", "Billing", true)
ingest = Panel([stream, flow], "Ingest", "orange", "workflow", false, "row")
stream = Item("Kafka", "kafka", "Events", true)
flow = Item("Airflow", "airflow", "Schedules", true)
warehouse = Panel([snow, model], "Warehouse", "blue", "database", true, "row")
snow = Item("Snowflake", "snowflake", "Storage", true)
model = Item("dbt", "dbt", "Models", true)
serve = Panel([bi], "Serve", "green", "chart", false, "row")
bi = Item("Grafana", "grafana", "Dashboards", true)
f1 = Flow("app", "stream")
f2 = Flow("saas", "flow")
f3 = Flow("stream", "snow")
f4 = Flow("model", "bi")`
    },
    {
      title: 'Microservices',
      about: 'A gateway, three services, their data and their monitoring.',
      code: `root = Architecture([edge, services, data, ops], [f1, f2, f3, f4, f5], "Microservices")
edge = Panel([gateway], "Edge", "violet", "cloud", false, "row")
gateway = Item("Nginx", "nginx", "Gateway", true)
services = Panel([billing, search, auth], "Services", "orange", "box", false, "row")
billing = Item("Billing", "go", "Go", true)
search = Item("Search", "fastapi", "Python", true)
auth = Item("Auth", "nodejs", "Node", true)
data = Panel([db, cache, queue], "Data", "blue", "database", true, "row")
db = Item("PostgreSQL", "postgresql", "Main store", true)
cache = Item("Redis", "redis", "Cache", true)
queue = Item("RabbitMQ", "rabbitmq", "Jobs", true)
ops = Panel([metrics], "Monitoring", "green", "chart", false, "row")
metrics = Item("Prometheus", "prometheus", "Metrics", true)
f1 = Flow("gateway", "billing")
f2 = Flow("gateway", "search")
f3 = Flow("billing", "db")
f4 = Flow("search", "cache")
f5 = Flow("auth", "queue")`
    }
  ]
}
