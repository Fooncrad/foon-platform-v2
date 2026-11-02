import test from "node:test";
import assert from "node:assert/strict";
import {
  MEDIA_STUDIO_LOCALES, MEDIA_STUDIO_SECTIONS, MEDIA_STUDIO_LABELS,
  MEDIA_STUDIO_PROVIDERS, mediaStudioSections
} from "../lib/platform/media-studio.ts";

test("Media Studio sections have complete translations", () => {
  assert.deepEqual([...MEDIA_STUDIO_LOCALES], ["ar", "en", "fr"]);
  assert.equal(MEDIA_STUDIO_SECTIONS.length, 7);
  for (const section of MEDIA_STUDIO_SECTIONS) {
    for (const locale of MEDIA_STUDIO_LOCALES) {
      assert.ok(MEDIA_STUDIO_LABELS[section][locale].trim(), section + "/" + locale);
    }
  }
});

test("section codes remain stable across languages", () => {
  for (const locale of MEDIA_STUDIO_LOCALES) {
    assert.deepEqual(mediaStudioSections(locale).map(item => item.code), [...MEDIA_STUDIO_SECTIONS]);
  }
});

test("provider registry does not imply granted OAuth permissions", () => {
  assert.deepEqual([...MEDIA_STUDIO_PROVIDERS], [
    "instagram", "facebook", "tiktok", "snapchat", "youtube", "x", "whatsapp"
  ]);
  assert.equal(Object.hasOwn(MEDIA_STUDIO_LABELS, "publishWithoutApproval"), false);
});
