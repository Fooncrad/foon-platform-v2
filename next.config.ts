/** @type {import('next').NextConfig} */
const activityRoutes = {
 restaurant:"restaurant",cafe:"cafe",sweets:"sweets",grocery:"grocery",
 fashion:"clothing",perfume:"perfume",accessories:"accessories",
 watches:"watches",gifts:"gifts",ecommerce:"ecommerce",
 carwash:"carwash",car:"automotive",laundry:"laundry",salon:"salon",contracting:"publicworks"
};
const nextConfig = {
 output: "standalone",
 poweredByHeader: false,
 reactStrictMode: true,
 async rewrites(){
  return Object.entries(activityRoutes).flatMap(([slug,activity])=>[
   {source:`/${slug}/:section(orders|reservations|tables|pos|menu|staff|settings)`,destination:`/workspace/${activity}?section=:section`},
   {source:`/${slug}/payments`,destination:`/workspace/${activity}/payments`},
   {source:`/${slug}/media-studio`,destination:`/workspace/${activity}/media-studio`},
   ...(slug==="restaurant"?[]:[{source:`/${slug}`,destination:`/workspace/${activity}`}])
  ]);
 }
};
export default nextConfig;
