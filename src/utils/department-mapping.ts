
// Department ID mapping as per frontend contract
export const departmentIdMap = {
  'Maintenance': 'dept_001',
  'Housekeeping': 'dept_002',
  'Front-of-House': 'dept_003',
  'Activities': 'dept_004',
  'Operations': 'dept_005',
  'Grounds': 'dept_006'
} as const;

export const departmentNameMap = Object.fromEntries(
  Object.entries(departmentIdMap).map(([name, id]) => [id, name])
) as Record<string, string>;

export type DepartmentName = keyof typeof departmentIdMap;
export type DepartmentId = typeof departmentIdMap[DepartmentName];

/**
 * Convert department name to department ID
 */
export function getDepartmentId(departmentName: string): string {
  return departmentIdMap[departmentName as DepartmentName] || departmentName;
}

/**
 * Convert department ID to department name
 */
export function getDepartmentName(departmentId: string): string {
  return departmentNameMap[departmentId] || departmentId;
}

/**
 * Check if a department name is valid
 */
export function isValidDepartmentName(name: string): name is DepartmentName {
  return name in departmentIdMap;
}

/**
 * Check if a department ID is valid
 */
export function isValidDepartmentId(id: string): id is DepartmentId {
  return id in departmentNameMap;
}

/**
 * Get all valid department names
 */
export function getAllDepartmentNames(): DepartmentName[] {
  return Object.keys(departmentIdMap) as DepartmentName[];
}

/**
 * Get all valid department IDs
 */
export function getAllDepartmentIds(): DepartmentId[] {
  return Object.values(departmentIdMap);
}
