import type { Gallery } from './types'

export const CLOUD: Gallery = {
  id: 'cloud',
  title: 'Cloud architectures',
  description: 'Systems drawn with the logos of the services they use: AWS, Kubernetes, Kafka and others.',
  tone: 'orange',
  icon: 'cloud',
  examples: [
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
