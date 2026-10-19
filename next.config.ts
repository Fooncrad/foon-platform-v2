/** @type {import('next').NextConfig} */
const activityRoutes = {
 restaurant:"restaurant",cafe:"cafe",sweets:"sweets",grocery:"grocery",
 fashion:"clothing",perfume:"perfume",accessories:"accessories",
 watches:"watches",gifts:"gifts",ecommerce:"ecommerce",
 carwash:"carwash",car:"automotive",laundry:"laundry",salon:"salon",contracting:"publicworks"
};
const sections=[
 "assigned","overview","branches","orders","pos","kds","menu","tables",
 "inventory","pickupPoints","team","marketing","reservations","subscription",
 "customers","storefront","remote","security","health","reports","printers",
 "quotes","serviceOrders","roomService"
];
const nextConfig = {
 output:"standalone",
 poweredByHeader:false,
 reactStrictMode:true,
 async redirects(){
  return Object.entries(activityRoutes).flatMap(([slug,activity])=>[
   {source:`/workspace/${activity}`,destination:`/${slug}`,permanent:false},
   {source:`/workspace/${activity}/:section`,destination:`/${slug}/:section`,permanent:false}
  ]);
 },
 async rewrites(){
  // Legacy merchant dashboard components are reused behind clean paths.
  // /restaurant is a real page; other activity roots need an internal rewrite.
  // Deep-link sections remain tenant-authorized inside workspace/[activity].
  return Object.entries(activityRoutes).flatMap(([slug,activity])=>[
   {source:`/${slug}/payments`,destination:`/workspace/${activity}/payments`},
   {source:`/${slug}/media-studio`,destination:`/workspace/${activity}/media-studio`},
   {source:`/${slug}/:section(${sections.join("|")})`,destination:`/workspace/${activity}?section=:section`},
   ...(slug==="restaurant"?[]:[{source:`/${slug}`,destination:`/workspace/${activity}`}])
  ]);
 }
};
export default nextConfig;
