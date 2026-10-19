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
        {source:`/${slug}/:section(${sections.join("|")})`,destination:`/workspace/${activity}?section=:section`},
        ...(slug==="restaurant"?[]:[{source:`/${slug}`,destination:`/workspace/${activity}`}])
      ];
    });
    // These must run BEFORE app/[slug], otherwise /car looks like a public
    // merchant slug and may incorrectly render a 404 or another tenant.
    return {beforeFiles,afterFiles:[],fallback:[]};
  },
  async headers() {
    const securityHeaders=[
      {key:"X-Content-Type-Options",value:"nosniff"},
      {key:"X-Frame-Options",value:"DENY"},
      {key:"Referrer-Policy",value:"strict-origin-when-cross-origin"},
      {key:"Permissions-Policy",value:"camera=(), microphone=(), geolocation=(), payment=()"},
      {key:"Cross-Origin-Opener-Policy",value:"same-origin"},
      {key:"Cross-Origin-Resource-Policy",value:"same-origin"},
      {key:"Content-Security-Policy",value:"default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; form-action 'self'; img-src 'self' data: blob: https:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; upgrade-insecure-requests"},
      {key:"Strict-Transport-Security",value:"max-age=31536000; includeSubDomains"}
    ];
    const receiptHeaders=securityHeaders.map(header=>header.key==="X-Frame-Options"?{...header,value:"SAMEORIGIN"}:header.key==="Content-Security-Policy"?{...header,value:header.value.replace("frame-ancestors 'none'","frame-ancestors 'self'")}:header.key==="Referrer-Policy"?{...header,value:"no-referrer"}:header);
    return [{source:"/:path*",headers:securityHeaders},{source:"/receipts/:path*",headers:receiptHeaders},{source:"/login",headers:receiptHeaders}];
  }
};

export default nextConfig;
