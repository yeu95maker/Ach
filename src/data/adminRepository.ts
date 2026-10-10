import { toAppError } from '@/core/errors'
import type { ShiftCategory } from '@/domain/types'
import { db, unwrap, unwrapList } from './client'

export type EmploymentType = 'full_time' | 'part_time' | 'marginal' | 'trainee' | 'agency' | 'other'

export interface AdminRoleAssignment {
  assignmentId: string
  roleId: string
  roleKey: string
  roleName: string
  unitId: string | null
  unitName: string | null
  departmentId: string | null
  departmentName: string | null
}

export interface AdminEmployee {
  employeeId: string
  userId: string
  firstName: string
  lastName: string
  email: string
  phone: string | null
  avatarPath: string | null
  personnelNumber: string | null
  jobTitle: string
  employmentType: EmploymentType
  weeklyHours: number | null
  status: 'active' | 'inactive'
  hireDate: string | null
  units: { id: string; name: string; isPrimary: boolean }[]
  roles: AdminRoleAssignment[]
}

export interface AssignableRole {
  roleId: string
  roleKey: string
  roleName: string
  description: string | null
}

export interface OrgDepartment {
  id: string
  name: string
  code: string | null
  isActive: boolean
  units: OrgUnit[]
}

export interface OrgUnit {
  id: string
  departmentId: string
  name: string
  code: string | null
  isActive: boolean
}

export interface AdminShiftType {
  id: string
  unitId: string | null
  code: string
  name: string
  category: ShiftCategory
  startTime: string
  endTime: string
  breakMinutes: number
  isActive: boolean
}

export interface InviteInput {
  hospitalId: string
  email: string
  firstName: string
  lastName: string
  jobTitle: string
  unitId: string | null
  roleKey: string
  locale: string
}

interface AdminEmployeeRow {
  employee_id: string
  user_id: string
  first_name: string
  last_name: string
  email: string
  phone: string | null
  avatar_path: string | null
  personnel_number: string | null
  job_title: string
  employment_type: EmploymentType
  weekly_hours: number | string | null
  status: 'active' | 'inactive'
  hire_date: string | null
  units: { id: string; name: string; is_primary: boolean }[]
  roles: {
    assignment_id: string
    role_id: string
    role_key: string
    role_name: string
    unit_id: string | null
    unit_name: string | null
    department_id: string | null
    department_name: string | null
  }[]
}

const time = (v: string) => v.slice(0, 5)

export const adminRepository = {
  async fetchEmployees(hospitalId: string): Promise<AdminEmployee[]> {
    const rows = unwrap<AdminEmployeeRow[]>(await db().rpc('admin_employees', { p_hospital_id: hospitalId })) ?? []
    return rows.map((r) => ({
      employeeId: r.employee_id,
      userId: r.user_id,
      firstName: r.first_name,
      lastName: r.last_name,
      email: r.email,
      phone: r.phone,
      avatarPath: r.avatar_path,
      personnelNumber: r.personnel_number,
      jobTitle: r.job_title,
      employmentType: r.employment_type,
      weeklyHours: r.weekly_hours === null ? null : Number(r.weekly_hours),
      status: r.status,
      hireDate: r.hire_date,
      units: r.units.map((u) => ({ id: u.id, name: u.name, isPrimary: u.is_primary })),
      roles: r.roles.map((x) => ({
        assignmentId: x.assignment_id,
        roleId: x.role_id,
        roleKey: x.role_key,
        roleName: x.role_name,
        unitId: x.unit_id,
        unitName: x.unit_name,
        departmentId: x.department_id,
        departmentName: x.department_name,
      })),
    }))
  },

  async fetchAssignableRoles(hospitalId: string): Promise<AssignableRole[]> {
    const rows = unwrapList<{ role_id: string; role_key: string; role_name: string; description: string | null }>(
      await db().rpc('assignable_roles', { p_hospital_id: hospitalId }),
    )
    return rows.map((r) => ({ roleId: r.role_id, roleKey: r.role_key, roleName: r.role_name, description: r.description }))
  },

  /** Invites by email (Edge Function: account + employment + ward + role). */
  async invite(input: InviteInput): Promise<{ invited: boolean }> {
    const { data, error } = await db().functions.invoke('invite-employee', {
      body: {
        hospital_id: input.hospitalId,
        email: input.email.trim(),
        first_name: input.firstName.trim(),
        last_name: input.lastName.trim(),
        job_title: input.jobTitle.trim(),
        unit_id: input.unitId,
        role_key: input.roleKey,
        locale: input.locale,
      },
    })
    if (error) {
      const status = (error as { context?: { status?: number } }).context?.status
      throw toAppError({ code: status === 403 ? '42501' : status === 409 ? '23505' : '22023', message: error.message })
    }
    return { invited: !!(data as { invited?: boolean } | null)?.invited }
  },

  async updateEmployee(
    employeeId: string,
    patch: Partial<{ job_title: string; personnel_number: string | null; employment_type: EmploymentType; weekly_hours: number | null; status: 'active' | 'inactive' }>,
  ) {
    unwrap(await db().from('employees').update(patch).eq('id', employeeId))
  },

  async addUnit(hospitalId: string, employeeId: string, unitId: string, isPrimary: boolean) {
    unwrap(await db().from('employee_units').insert({ hospital_id: hospitalId, employee_id: employeeId, unit_id: unitId, is_primary: isPrimary }))
  },

  async removeUnit(employeeId: string, unitId: string) {
    unwrap(await db().from('employee_units').delete().eq('employee_id', employeeId).eq('unit_id', unitId))
  },

  async setPrimaryUnit(employeeId: string, unitId: string) {
    unwrap(await db().from('employee_units').update({ is_primary: false }).eq('employee_id', employeeId).eq('is_primary', true))
    unwrap(await db().from('employee_units').update({ is_primary: true }).eq('employee_id', employeeId).eq('unit_id', unitId))
  },

  async addRole(hospitalId: string, employeeId: string, roleId: string, scope: { unitId?: string | null; departmentId?: string | null }) {
    unwrap(
      await db()
        .from('employee_roles')
        .insert({ hospital_id: hospitalId, employee_id: employeeId, role_id: roleId, unit_id: scope.unitId ?? null, department_id: scope.departmentId ?? null }),
    )
  },

  async removeRole(assignmentId: string) {
    unwrap(await db().from('employee_roles').delete().eq('id', assignmentId))
  },

  async fetchOrganization(hospitalId: string): Promise<OrgDepartment[]> {
    const [deps, units] = await Promise.all([
      db().from('departments').select('id, name, code, is_active').eq('hospital_id', hospitalId).order('name'),
      db().from('units').select('id, department_id, name, code, is_active').eq('hospital_id', hospitalId).order('name'),
    ])
    const unitRows = unwrapList<{ id: string; department_id: string; name: string; code: string | null; is_active: boolean }>(units)
    return unwrapList<{ id: string; name: string; code: string | null; is_active: boolean }>(deps).map((d) => ({
      id: d.id,
      name: d.name,
      code: d.code,
      isActive: d.is_active,
      units: unitRows
        .filter((u) => u.department_id === d.id)
        .map((u) => ({ id: u.id, departmentId: u.department_id, name: u.name, code: u.code, isActive: u.is_active })),
    }))
  },

  async saveDepartment(hospitalId: string, d: { id?: string; name: string; code: string | null; isActive: boolean }) {
    const values = { name: d.name.trim(), code: d.code?.trim() || null, is_active: d.isActive }
    unwrap(d.id ? await db().from('departments').update(values).eq('id', d.id) : await db().from('departments').insert({ hospital_id: hospitalId, ...values }))
  },

  async saveUnit(hospitalId: string, u: { id?: string; departmentId: string; name: string; code: string | null; isActive: boolean }) {
    const values = { department_id: u.departmentId, name: u.name.trim(), code: u.code?.trim() || null, is_active: u.isActive }
    unwrap(u.id ? await db().from('units').update(values).eq('id', u.id) : await db().from('units').insert({ hospital_id: hospitalId, ...values }))
  },

  async fetchShiftTypes(hospitalId: string): Promise<AdminShiftType[]> {
    const rows = unwrapList<{
      id: string
      unit_id: string | null
      code: string
      name: string
      category: ShiftCategory
      start_time: string
      end_time: string
      break_minutes: number
      is_active: boolean
    }>(
      await db()
        .from('shift_types')
        .select('id, unit_id, code, name, category, start_time, end_time, break_minutes, is_active')
        .eq('hospital_id', hospitalId)
        .order('sort_order')
        .order('code'),
    )
    return rows.map((r) => ({
      id: r.id,
      unitId: r.unit_id,
      code: r.code,
      name: r.name,
      category: r.category,
      startTime: time(r.start_time),
      endTime: time(r.end_time),
      breakMinutes: r.break_minutes,
      isActive: r.is_active,
    }))
  },

  async saveShiftType(hospitalId: string, s: Omit<AdminShiftType, 'id'> & { id?: string }) {
    const values = {
      unit_id: s.unitId,
      code: s.code.trim(),
      name: s.name.trim(),
      category: s.category,
      start_time: s.startTime,
      end_time: s.endTime,
      break_minutes: s.breakMinutes,
      is_active: s.isActive,
    }
    unwrap(s.id ? await db().from('shift_types').update(values).eq('id', s.id) : await db().from('shift_types').insert({ hospital_id: hospitalId, ...values }))
  },
}
