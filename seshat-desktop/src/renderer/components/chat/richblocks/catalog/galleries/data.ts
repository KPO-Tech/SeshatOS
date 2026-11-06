import type { Gallery } from './types'

export const DATA: Gallery = {
  id: 'data',
  title: 'Data science',
  description: 'The pictures of a model: learning curves, errors, correlations and classification.',
  tone: 'violet',
  icon: 'chart',
  examples: [
    {
      title: 'Learning curves',
      about: 'Train and validation loss, epoch by epoch.',
      code: `root = Stack([curves, note])
curves = LineChart(["1", "2", "3", "4", "5", "6", "7", "8"], [Series("train", [0.92, 0.55, 0.38, 0.29, 0.24, 0.2, 0.17, 0.15], "blue"), Series("validation", [0.95, 0.63, 0.47, 0.42, 0.41, 0.43, 0.46, 0.5], "orange")], null, "Loss per epoch", "epoch", "loss")
note = Callout("warning", "Overfitting from epoch 6", "Validation loss rises while training loss keeps falling: stop at epoch 5 or add regularisation.")`
    },
    {
      title: 'Confusion matrix',
      about: 'What was predicted, against what it was.',
      code: `root = Stack([matrix, metrics])
matrix = Heatmap(["cat", "dog", "bird"], ["cat", "dog", "bird"], [[48, 2, 0], [5, 41, 4], [1, 3, 46]], "Confusion matrix", "blue", 0)
metrics = MetricRow([Metric("Accuracy", "91%", "+2%", "up"), Metric("Worst class", "dog", null, null, "recall 82%"), Metric("Samples", 150)])`
    },
    {
      title: 'Residuals',
      about: 'The errors of a model, in a histogram.',
      code: `root = Stack([hist, stats])
hist = Histogram([-0.6, -0.4, -0.35, -0.3, -0.2, -0.2, -0.15, -0.1, -0.1, -0.05, 0, 0, 0.05, 0.05, 0.1, 0.1, 0.15, 0.2, 0.25, 0.3, 0.45, 0.9], 9, "Residuals", "error", "violet")
stats = MetricRow([Metric("Mean error", "0.02"), Metric("Std. deviation", "0.28"), Metric("Outliers", 1, null, null, "above 0.8")])`
    },
    {
      title: 'A regression',
      about: 'Points, and the line that fits them.',
      code: `root = ScatterChart([data, fit], "hours studied", "mark", "Marks against hours studied")
data = Points("students", [[1, 8], [2, 9], [2.5, 12], [3, 11], [4, 14], [4.5, 13], [5, 16], [6, 17], [6.5, 15], [7, 19], [8, 20]], "blue")
fit = Points("fit: 1.7 x + 6.4", [[0, 6.4], [8.5, 20.85]], "orange", true)`
    },
    {
      title: 'Correlations',
      about: 'Which features move together.',
      code: `root = Heatmap(["age", "income", "tenure", "spend"], ["age", "income", "tenure", "spend"], [[1, 0.42, 0.68, 0.21], [0.42, 1, 0.31, 0.74], [0.68, 0.31, 1, 0.18], [0.21, 0.74, 0.18, 1]], "Correlation matrix", "violet", 2)`
    },
    {
      title: 'An ROC curve',
      about: 'How good a classifier is at every threshold.',
      code: `root = Stack([roc, auc])
roc = ScatterChart([model, chance], "false positive rate", "true positive rate", "ROC curve")
model = Points("model", [[0, 0], [0.02, 0.35], [0.05, 0.6], [0.1, 0.78], [0.2, 0.89], [0.4, 0.95], [0.7, 0.98], [1, 1]], "blue", true)
chance = Points("chance", [[0, 0], [1, 1]], "red", true)
auc = MetricRow([Metric("AUC", "0.94", "+0.03", "up"), Metric("Best threshold", "0.46")])`
    }
  ]
}
