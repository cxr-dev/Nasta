(async () => {
  try {
    const proxyUrl =
      "https://api.allorigins.win/raw?url=" +
      encodeURIComponent("https://api.visitstockholm.com/documentation/");
    const response = await fetch(proxyUrl);
    const t = await response.text();
    console.log(
      "Successfully fetched documentation HTML via proxy. Length:",
      t.length,
    );
    const terms = [
      "openapi",
      "swagger",
      "swagger.json",
      "openapi.json",
      "/api",
      "/events",
      "/places",
      "/v1",
    ];
    for (const term of terms) {
      console.log(term, "->", t.indexOf(term));
    }
    const m = t.match(/"url":"([^\"]+)"/g);
    if (m) {
      console.log("url matches", m.slice(0, 10));
    } else {
      console.log('No direct "url" JSON patterns matched in HTML text.');
    }
  } catch (err) {
    console.error("Verification script failed:", err);
    process.exit(1);
  }
})();
