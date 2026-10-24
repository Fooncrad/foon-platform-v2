import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const globals=readFileSync(new URL("../app/globals.css",import.meta.url),"utf8");
const selector=readFileSync(new URL("../app/components/language-selector.tsx",import.meta.url),"utf8");
const dashboardCss=readFileSync(new URL("../app/restaurant/merchant-dashboard.css",import.meta.url),"utf8");
const storefrontCss=readFileSync(new URL("../app/[slug]/storefront-refresh.css",import.meta.url),"utf8");
const menuCss=readFileSync(new URL("../app/[slug]/public-menu.css",import.meta.url),"utf8");
const storefrontTheme=readFileSync(new URL("../app/[slug]/storefront-theme-toggle.tsx",import.meta.url),"utf8");
const offlineMenuSave=readFileSync(new URL("../app/[slug]/offline-menu-save.tsx",import.meta.url),"utf8");
const publicMenu=readFileSync(new URL("../app/[slug]/public-menu.tsx",import.meta.url),"utf8");

test("language label is screen-reader-only across public, storefront and dashboard surfaces",()=>{
 assert.match(selector,/className="sr-only"/);
 assert.match(globals,/\.sr-only\s*\{[^}]*position:absolute!important[^}]*clip:rect\(0,0,0,0\)!important/s);
 assert.doesNotMatch(globals,/\.foonPublic\s+\.sr-only\s*\{/);
});

test("language controls and activity storefront header have compact mobile rules",()=>{
 assert.match(globals,/\.foonPublic \.foonLanguageSelector select\{[^}]*width:100px/);
 assert.match(globals,/\.foonActivityHeaderNav\{width:100%;justify-content:flex-start/);
 assert.match(dashboardCss,/\.restaurantLanguageSelector select\{min-width:100px;max-width:125px/);
 assert.match(dashboardCss,/\.restaurantTenantSelector select\{width:100%;max-width:none/);
});

test("public menus and activity stores have persistent light/dark themes and responsive covers",()=>{
 assert.match(storefrontTheme,/localStorage\.getItem\(storageKey\)/);
 assert.match(storefrontTheme,/localStorage\.setItem\(storageKey,next\)/);
 assert.match(menuCss,/\.publicMenu\[data-color-mode="dark"\]/);
 assert.match(storefrontCss,/\.foonActivityStorefront\[data-color-mode="dark"\]/);
 assert.match(storefrontCss,/\.publicMenu \.publicMenuHero\[data-cover-shape="filled"\]/);
 assert.match(storefrontCss,/\.foonActivityHeroImage/);
 assert.match(storefrontCss,/@media \(max-width: 340px\)[\s\S]*repeat\(2, minmax\(0, 1fr\)\)/);
 assert.match(storefrontCss,/\.foonActivityStorefront \.foonActivityProducts \{[\s\S]{0,100}grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
 assert.match(storefrontCss,/\.foonActivityStorefront \.foonActivityProducts \{ grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
 assert.match(storefrontCss,/\.foonActivityStorefront \.foonActivityProducts \{ grid-template-columns: repeat\(6, minmax\(0, 1fr\)\)/);
 assert.match(storefrontCss,/@media \(min-width: 1920px\)[\s\S]*\.foonActivityStorefront \.foonActivityProducts \{ grid-template-columns: repeat\(8, minmax\(0, 1fr\)\)/);
 assert.match(storefrontCss,/@media \(min-width: 993px\) and \(max-width: 1150px\)[\s\S]*\.publicMenu \.publicMenuLayout \.publicMenuItems \{ grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
 assert.match(storefrontCss,/\.publicMenu \.publicMenuItem \.publicMenuItemImage/);
 assert.match(storefrontCss,/\.publicMenu \.publicMenuItemBody h2/);
 assert.match(storefrontCss,/\.publicMenu \.publicMenuItem footer\.publicMenuItemFooter/);
 assert.match(storefrontCss,/height: 160px !important/);
 assert.match(storefrontCss,/height: 220px !important/);
 assert.match(storefrontCss,/height: 320px !important/);
});


test("public menu mobile actions are not duplicated and offline status follows the selected language",()=>{
 assert.match(offlineMenuSave,/language==="ar"\?"المنيو محفوظ للتصفح دون اتصال":language==="fr"\?"Menu enregistré pour une consultation hors connexion":"Menu saved for offline browsing"/);
 assert.doesNotMatch(offlineMenuSave,/المنيو محفوظ للتصفح دون اتصال\s*·\s*Offline menu saved/);
 assert.match(publicMenu,/OfflineMenuSave[^\n]*language=\{language\}/);
 assert.doesNotMatch(publicMenu,/publicMenuMobileDock[^\n]*MenuServiceActions/);
 assert.match(publicMenu,/publicMenuInfoBar[^\n]*mode="reservation"/);
 assert.match(publicMenu,/publicMenuHeader[^\n]*mode="waiter"/);
});

const stableStorefrontCss=readFileSync(new URL("../app/[slug]/unified-storefront-ux.css",import.meta.url),"utf8");
const stableCart=readFileSync(new URL("../app/[slug]/storefront-cart.tsx",import.meta.url),"utf8");

test("storefront and menu remain width-stable during mobile booking and checkout",()=>{
 assert.match(stableStorefrontCss,/html:has\(\.publicMenu\)[\s\S]*scrollbar-gutter: stable/);
 assert.match(stableStorefrontCss,/\.publicMenu :is\(input:not\([\s\S]*font-size: 16px !important/);
 assert.match(stableStorefrontCss,/max-inline-size: calc\(100dvw - 24px\)/);
 assert.match(stableStorefrontCss,/max-block-size: calc\(100dvh - 24px\)/);
 assert.match(stableStorefrontCss,/\.publicMenu:has\(\.publicMenuCart :is\(input, textarea, select\):focus\) \.publicMenuMobileDock/);
 assert.doesNotMatch(publicMenu,/categoryDialog\.current\?\.close\(\);document\.getElementById\('menu-items'\)\?\.scrollIntoView/);
 assert.doesNotMatch(stableCart,/scrollIntoView/);
});
