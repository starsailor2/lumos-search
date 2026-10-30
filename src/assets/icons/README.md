# Official interface assets

UI glyphs: **Flaticon Uicons 4.0.0 Thin Rounded**. Recognized app brands: **Flaticon Uicons 4.0.0 Brands**. Both are local WOFF2 vector fonts, used with the publisher's license and credit in Settings and the repository README.

- Guide and attribution: https://www.flaticon.com/uicons/get-started/
- Thin source: https://cdn-uicons.flaticon.com/4.0.0/uicons-thin-rounded/css/uicons-thin-rounded.css
- Brands source: https://cdn-uicons.flaticon.com/4.0.0/uicons-brands/css/uicons-brands.css
- Publisher license: [Flaticon-LICENSE.txt](Flaticon-LICENSE.txt), retained from the official `@flaticon/flaticon-uicons` package.
- `uicons.json` records semantic names, official codepoints, source version, and SHA-256 checksums for both fonts.

To regenerate the compact mapping, save the two official stylesheets as `test-output/uicons-thin-rounded-4.css` and `test-output/uicons-brands-4.css`, place their corresponding WOFF2 files here under the existing names, and run `node scripts/sync-uicons.cjs`. The script checks every selected glyph and the WOFF2 signatures. Review changes to the publisher's terms before updating assets.

These assets retain the Flaticon License and are not relicensed under the application's MIT declaration. Brand names and marks belong to their respective owners.
