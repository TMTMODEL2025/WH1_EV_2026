export interface UserItem {
  name: string;
  employeeId: string;
  role?: 'Driver' | 'Admin' | 'Supervisor';
}

export const USERS_DATABASE: UserItem[] = [];
