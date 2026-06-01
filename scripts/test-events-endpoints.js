(async () => {
  const endpoints = [
    {
      name: "api.visitstockholm /api/events",
      url: "https://api.visitstockholm.com/api/events",
    },
    {
      name: "api.visitstockholm /events",
      url: "https://api.visitstockholm.com/events",
    },
    {
      name: "visitstockholm.com /events",
      url: "https://visitstockholm.com/events",
    },
    {
      name: "visitstockholm.com /api/events",
      url: "https://visitstockholm.com/api/events",
    },
    {
      name: "www.visitstockholm.com /events",
      url: "https://www.visitstockholm.com/events",
    },
    {
      name: "eventapi.stockholm.se /events",
      url: "https://eventapi.stockholm.se/events",
    },
  ];
  const params = new URLSearchParams({
    lat: "59.3301",
    lon: "18.0706",
    radius: "1000",
    upcoming: "true",
    limit: "5",
  });

  for (const e of endpoints) {
    const url = `${e.url}?${params.toString()}`;
    const start = Date.now();
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "User-Agent": "Nasta/1.0",
          Referer: "https://www.visitstockholm.com",
        },
      }).catch((err) => {
        throw err;
      });
      clearTimeout(id);
      const elapsed = Date.now() - start;
      let text = null;
      try {
        text = await res.text();
      } catch (_) {
        text = null;
      }
      let parsed = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch (_) {
        parsed = null;
      }
      const summary = parsed
        ? Array.isArray(parsed)
          ? { arrayLength: parsed.length }
          : parsed.events
            ? {
                eventsItems: parsed.events.items
                  ? parsed.events.items.length
                  : parsed.events.length || null,
              }
            : parsed.data
              ? { dataLength: parsed.data.length }
              : { keys: Object.keys(parsed).slice(0, 5) }
        : null;
      console.log(
        JSON.stringify(
          {
            name: e.name,
            url,
            status: res.status,
            ok: res.ok,
            contentType: res.headers.get("content-type") || null,
            elapsed,
            summary,
            bodySample: text ? text.slice(0, 800) : null,
          },
          null,
          2,
        ),
      );
    } catch (err) {
      const elapsed = Date.now() - start;
      console.log(
        JSON.stringify(
          {
            name: e.name,
            url,
            error: (err && err.message) || String(err),
            elapsed,
          },
          null,
          2,
        ),
      );
    }
  }
})();
