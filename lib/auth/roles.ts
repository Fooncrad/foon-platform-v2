export const tenantRoles=["owner","manager","cashier","waiter","kitchen","driver","accountant"] as const;
export type TenantRole=(typeof tenantRoles)[number];
export const platformRoles=["super_admin","admin","support"] as const;
export type PlatformRole=(typeof platformRoles)[number];

export function isTenantRole(value:string):value is TenantRole{
  return tenantRoles.includes(value as TenantRole);
}
export function isPlatformRole(value:string):value is PlatformRole{
  return platformRoles.includes(value as PlatformRole);
}
