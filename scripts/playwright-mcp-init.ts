type InitPageContext = {
  page: {
    url: () => string;
    goto: (url: string) => Promise<unknown>;
  };
};

const appUrl = "http://localhost:5173/";

export default async ({ page }: InitPageContext) => {
  const currentUrl = page.url();

  if (currentUrl === "about:blank") {
    await page.goto(appUrl);
    return;
  }

  const url = new URL(currentUrl);
  if (url.protocol === "http:" && url.hostname === "127.0.0.1" && url.port === "5173") {
    url.hostname = "localhost";
    await page.goto(url.toString());
  }
};
