import { expect, test } from "bun:test";
import { consentRequest, extractHiddenFields, isConsentPage, pageRequestBody } from "../../src/dibbs/form";
import { fixture } from "../helpers/fixtures";

test("detects consent page", () => {
  expect(isConsentPage(fixture("consent.html"))).toBe(true);
  expect(isConsentPage(fixture("records-post-p1.html"))).toBe(false);
});

test("extracts hidden fields", () => {
  const f = extractHiddenFields(fixture("consent.html"));
  expect(f.__VIEWSTATEFIELDCOUNT).toBe("24");
  expect(f.__EVENTVALIDATION).toBeTruthy();
});

test("builds consent request against the form action", () => {
  const c = consentRequest(fixture("consent.html"), "https://www.dibbs.bsm.dla.mil/dodwarning.aspx?goto=/rfq/");
  expect(c.body.get("butAgree")).toBe("OK");
  expect(c.body.get("__VIEWSTATE23")).toBeTruthy();
  expect(c.url.startsWith("https://www.dibbs.bsm.dla.mil/dodwarning.aspx")).toBe(true);
});

test("builds paging postback body", () => {
  const p = pageRequestBody(fixture("records-post-p1.html"), 2);
  expect(p.get("__EVENTARGUMENT")).toBe("Page$2");
  expect(p.get("__EVENTTARGET")).toBe("ctl00$cph1$grdRfqSearch");
  expect(p.get("__EVENTVALIDATION")).toBeTruthy();
});
