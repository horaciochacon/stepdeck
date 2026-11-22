# Contributing to stepdeck

Thanks for helping. This page is the short version; the full guide is
[docs/contributing/index.md](../docs/contributing/index.md).

## Set up

You need Node 22.15 or later to run the tests (the CLI itself runs on Node 20), npm, and Chrome.

```sh
git clone https://github.com/horaciochacon/stepdeck.git
cd stepdeck
npm install
```

## Run the tests

The unit tests need no browser and take a few seconds:

```sh
npm test
```

The browser suite drives Chrome through Playwright, which is not a dependency of this repository. Install it
where Node can find it, or point `STEPDECK_PLAYWRIGHT` at a `playwright` package folder. It runs six files at a
time and takes about five minutes:

```sh
STEPDECK_PLAYWRIGHT=/path/to/node_modules/playwright npm run test:browser
```

To preview the GitHub Pages site as Pages serves it (the repository under `/stepdeck/`):

```sh
npm run site
```

## Before you open a pull request

- `npm test` and the browser suite pass.
- The docs, the skill and the READMEs say what the code now does
  ([Keep the docs in sync](../docs/contributing/index.md#keep-the-docs-in-sync)).

How to add a component, a layout, a theme or a rule, and how the tests are organized, is in
[docs/contributing/](../docs/contributing/index.md).
