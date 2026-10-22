import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import RootLayout from "@/app/layout";
import Home from "@/app/page";

describe("project bootstrap", () => {
  it("renders the root page through TypeScript and the source alias", () => {
    const html = renderToStaticMarkup(<Home />);

    expect(html).toMatch(/<main[\s>]/);
    expect(html).toMatch(/<h1[\s>][\s\S]+?<\/h1>/);
  });

  it("renders a Korean document around the page without external services", () => {
    const html = renderToStaticMarkup(
      <RootLayout>
        <Home />
      </RootLayout>,
    );

    expect(html).toContain('<html lang="ko">');
    expect(html).toMatch(/<body>[\s\S]*<main[\s>]/);
  });
});
