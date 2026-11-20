// Never imported by the catalog. If it were, this marks the import and throws.
globalThis.__stepdeckCatalogImportedBoom = true;
throw new Error("bad.boom: index.js must never be imported by the catalog");
