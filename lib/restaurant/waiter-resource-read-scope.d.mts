export interface WaiterDiningResource {
  id: string;
  data?: Record<string, unknown> | null;
}
export declare function scopeWaiterDiningRead<T extends WaiterDiningResource>(
  module: string, resources: T[], assignedTableIds: string[], assignedSectionIds?: string[]
): T[];
export declare function waiterAssignedSectionIds<T extends WaiterDiningResource>(
  tables: T[], assignedTableIds: string[]
): string[];
