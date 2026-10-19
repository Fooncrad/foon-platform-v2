/** @type {import('next').NextConfig} */
// These are URL aliases, not tenant IDs or activity_code replacements.
// Keep in sync with lib/tenant/workspace-routes.ts and migration 0101.
const activityRoutes={
 restaurant:"restaurant",cafe:"cafe",sweets:"sweets",grocery:"grocery",
 fashion:"clothing",perfume:"perfume",accessories:"accessories",watches:"watches",
 gifts:"gifts",ecommerce:"ecommerce",carwash:"carwash",car:"automotive",
 laundry:"laundry",salon:"salon",contracting:"publicworks"
};
const merchantSections=[
 "assigned","overview","branches","orders","pos","kds","menu","tables",
 "inventory","pickupPoints","team","marketing","reservations","subscription",
 "customers","storefront","remote","security","health","reports","printers",
 "quotes","serviceOrders","roomService"
];

const nextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,

  // Keep old bookmarks alive without changing tenant IDs.
  async redirects(){
    return Object.entries(activityRoutes).flatMap(([slug,activity])=>[
      {source:`/workspace/${activity}`,destination:`/${slug}`,permanent:false},
      {source:`/workspace/${activity}/:section`,destination:`/${slug}/:section`,permanent:false}
    ]);
  },
  async rewrites(){
    const beforeFiles=Object.entries(activityRoutes).flatMap(([slug,activity])=>{
      const sections=slug==="restaurant"?merchantSections.filter(section=>section!=="menu"):merchantSections;
      return [
        {source:`/${slug}/payments`,destination:`/workspace/${activity}/payments`},
        {source:`/${slug}/media-studio`,destination:`/workspace/${activity}/media-studio`},
        {source:`/${slug}/setup`,destination:`/restaurant/activity-setup?activity=${activity}`},
        ...(["carwash","automotive","laundry","salon","publicworks"].includes(activity)?[{source:`/${slug}/services`,destination:`/workspace/${activity}?section=menu`}]:[]),
        {source:`/${slug}/:section(${sections.join("|")})`,destination:`/workspace/${activity}?section=:section`},
        ...(slug==="restaurant"?[]:[{source:`/${slug}`,destination:`/workspace/${activity}`}])
      ];
    });
    // These must run BEFORE app/[slug], otherwise /car looks like a public
    // merchant slug and may incorrectly render a 404 or another tenant.
    return {beforeFiles,afterFiles:[],fallback:[]};
  }
};

export default nextConfig;
