# Far Future Ideas

Status: speculative ideas only. These are not part of the first implementation
target.

## 1. Price Trend Prediction Model

Train a machine learning model on the historical Market Dataset to predict how
prices are likely to change for different vehicle segments over time.

The general idea is to use accumulated Listing history, Listing Snapshots,
Observed Sold Prices, Last Asking Prices, mileage, model year, fuel type,
transmission, seller type, region, and availability duration to estimate future
price movement. For example, the product could answer questions like:

- How quickly do Toyota Corolla prices decline by model year?
- What is the expected price range for a Honda Civic 2017-2019 automatic in
  three months?
- Which vehicle segments are dropping fastest?
- Which models hold value unusually well?
- Is a current Listing priced above or below the expected market trend?

Possible prediction targets:

- Expected Asking Price after a time window.
- Expected Observed Sold Price range.
- Depreciation curve by make, model, year, mileage, and fuel type.
- Probability that a Listing's price will drop within a period.
- Expected days-on-market proxy.

The first useful version does not need a neural network. Start with simpler
baseline models:

- Linear or regularized regression.
- Gradient boosted trees.
- Random forest.
- Time-series baselines by segment.
- Quantile regression for price ranges.

Only consider neural networks later if the dataset becomes large enough and the
baseline models are clearly insufficient.

Possible tooling:

- Python for model training and experimentation.
- pandas or Polars for dataset preparation.
- scikit-learn for baseline models.
- XGBoost or LightGBM for stronger tabular models.
- PyTorch if neural networks become useful.
- MLflow or simple versioned artifacts for experiment tracking later.

Possible architecture:

```text
PostgreSQL Market Dataset
  -> offline training/export job
  -> model training pipeline
  -> versioned model artifact
  -> prediction job or API endpoint
  -> public analytics UI
```

The model should be trained offline, not inside normal request handling. The
application can later serve predictions from precomputed tables or a small
prediction service if needed.

Important cautions:

- Coverage Metadata matters. A model trained on incomplete crawl coverage can
  confidently learn bad patterns.
- Observed Sold Price is not actual transaction price.
- Vehicle segments with small Sample Size should show uncertainty or no
  prediction.
- Predictions should be displayed as estimates/ranges, not facts.
- The system should keep model version, training data window, and error metrics
  visible.

This idea depends on first building a reliable historical dataset. The earliest
useful step is not a neural network; it is clean normalized data, enough history,
and honest evaluation against held-out past periods.

## 2. Listing Buyer Due Diligence Report

Add an opinionated buyer-side report for a specific used car Listing. This is not
"AI car search"; it is a second-opinion tool for someone already looking at a
specific vehicle.

The feature could work in two ways:

- On a Public Listing Page in this app, generate a buyer report for that Listing.
- Accept a Nettiauto URL or pasted listing text and generate a report from it.

The core promise:

```text
Paste or open a used car Listing.
Get a critical buyer report: fair price, hidden risks, what to verify, what to
ask the seller, what to inspect, and whether to buy, negotiate, shortlist, or
avoid.
```

The value is the opinion layer. Marketplaces already show price, mileage, seller
text, photos, and equipment. They do not usually answer whether this specific
car is a good buy for this buyer, in this country, at this price, with this
trim, mileage, warranty situation, and known model-specific risks.

Possible report sections:

- Verdict: buy, shortlist, negotiate, or avoid.
- Confidence level.
- Fair price range.
- Negotiation target.
- Main reasons to buy.
- Main risks.
- Seller questions.
- Inspection checklist.
- Warranty and service concerns.
- Market comparison against similar Listings.
- Comparison against saved or pasted alternatives.
- Short negotiation message the buyer can send.

The evaluation pipeline could be:

```text
Listing input
  -> extract Listing facts
  -> normalize vehicle profile
  -> compare against Market Dataset
  -> enrich with model/year/trim knowledge
  -> apply country/local risk context
  -> apply buyer priorities
  -> generate opinionated report
```

Input facts could include:

- Make, model, trim, and model year.
- First registration date.
- Mileage.
- Asking Price or Observed Sold Price context.
- Seller type.
- Registration Number and VIN when available to admin/private flows.
- Fuel type, transmission, drivetrain, engine, battery, and range claims.
- Warranty information.
- Inspection date.
- Tyres, equipment, options, and description.
- Accident/history hints and seller disclaimers.

The Market Dataset would make this stronger than a generic LLM summary. The
report could compare the Listing against similar cars by year, mileage, trim,
seller type, fuel type, and recent price trends. It could say whether the Listing
looks cheap, fair, or overpriced relative to our observed market data, while
still showing uncertainty when Sample Size or coverage is weak.

The best starting niche is probably used EVs in Finland/Nordics, especially
common Tesla Model 3/Y Listings. Used EVs have more buyer uncertainty than many
combustion cars:

- Battery health.
- Real winter range.
- Charging speed.
- Battery chemistry.
- Warranty headroom.
- Heat pump and hardware generation.
- Sensor differences.
- Depreciation.
- Country-specific winter and road-salt concerns.

Possible tooling:

- Existing TypeScript API for Listing facts and Market Dataset comparisons.
- Offline model/year knowledge base curated from reliable sources.
- Retrieval-augmented generation for model-specific known issues and warranty
  details.
- LLM for synthesis, critique, report writing, seller questions, and negotiation
  script.
- Strict structured output schema so the UI can render verdicts, risks, and
  checklists consistently.

Possible architecture:

```text
Public Listing Page or pasted URL
  -> Product API fetches normalized Listing data
  -> market comparison query
  -> model/year knowledge retrieval
  -> LLM report generation
  -> stored or cached Buyer Report
  -> UI renders structured report
```

The feature should not blindly trust the LLM. The deterministic parts should be
kept outside the model where possible:

- Listing fact extraction.
- Market comparison.
- Price percentile/range calculations.
- Warranty/date/mileage arithmetic.
- Coverage Metadata and Sample Size.

The LLM should be used for synthesis and judgment: explaining tradeoffs,
highlighting risks, generating seller questions, and producing the final
opinion.

Important cautions:

- The report must not claim certainty about actual vehicle condition.
- It should recommend physical inspection where appropriate.
- It should distinguish source facts from model knowledge and model opinion.
- It should show confidence and data limitations.
- It should not expose admin-only VIN or Raw Listing Data on public reports.
- It should avoid pretending Observed Sold Price is actual transaction price.

This is a far-future feature because it depends on the core dataset first:
reliable Listing parsing, normalized fields, price history, market comparison,
coverage metadata, and enough detail-page enrichment to make the analysis useful.
