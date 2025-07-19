import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateAuth } from '@/utils/auth';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// Department ID mapping
const departmentIdMap = {
  'Maintenance': 'dept_001',
  'Housekeeping': 'dept_002',
  'Front-of-House': 'dept_003',
  'Activities': 'dept_004',
  'Operations': 'dept_005',
  'Grounds': 'dept_006'
};

const departmentNameMap = Object.fromEntries(
  Object.entries(departmentIdMap).map(([name, id]) => [id, name])
);

export async function GET(request: NextRequest) {
  try {
    const authResult = await validateAuth(request);
    if (!authResult.success) {
      return NextResponse.json({ 
        success: false, 
        message: 'Authentication required',
        error: authResult.error 
      }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const department = searchParams.get('department');

    let query = supabase
      .from('sops')
      .select('*')
      .order('created_at', { ascending: false });

    // Apply department filtering based on user role
    if (authResult.user.role !== 'God' && authResult.user.role !== 'Admin') {
      if (department) {
        const deptId = departmentIdMap[department as keyof typeof departmentIdMap] || department;
        query = query.eq('department_id', deptId);
      } else if (authResult.user.department_id) {
        query = query.eq('department_id', authResult.user.department_id);
      }
    } else if (department && department !== 'all') {
      const deptId = departmentIdMap[department as keyof typeof departmentIdMap] || department;
      query = query.eq('department_id', deptId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching SOPs:', error);
      return NextResponse.json({ 
        success: false, 
        message: 'Failed to fetch SOPs',
        error: error.message 
      }, { status: 500 });
    }

    // Convert department IDs to names in response
    const sopsWithDepartmentNames = data?.map(sop => ({
      ...sop,
      department: departmentNameMap[sop.department_id] || sop.department_id
    }));

    return NextResponse.json({
      success: true,
      message: 'SOPs retrieved successfully',
      data: sopsWithDepartmentNames
    });
  } catch (error) {
    console.error('Error in SOPs GET:', error);
    return NextResponse.json({ 
      success: false, 
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await validateAuth(request);
    if (!authResult.success) {
      return NextResponse.json({ 
        success: false, 
        message: 'Authentication required',
        error: authResult.error 
      }, { status: 401 });
    }

    const body = await request.json();
    const { title, content, department, department_id, file_url, tags } = body;

    // Validate required fields
    if (!title || !content) {
      return NextResponse.json({ 
        success: false, 
        message: 'Title and content are required' 
      }, { status: 400 });
    }

    // Convert department name to ID if provided
    let finalDepartmentId = department_id;
    if (department && !department_id) {
      finalDepartmentId = departmentIdMap[department as keyof typeof departmentIdMap] || department;
    }

    const { data, error } = await supabase
      .from('sops')
      .insert({
        title,
        content,
        department_id: finalDepartmentId || authResult.user.department_id,
        file_url,
        tags,
        created_by: authResult.user.id,
        updated_by: authResult.user.id
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating SOP:', error);
      return NextResponse.json({ 
        success: false, 
        message: 'Failed to create SOP',
        error: error.message 
      }, { status: 500 });
    }

    // Convert department ID to name in response
    const sopWithDepartmentName = {
      ...data,
      department: departmentNameMap[data.department_id] || data.department_id
    };

    return NextResponse.json({
      success: true,
      message: 'SOP created successfully',
      data: sopWithDepartmentName
    }, { status: 201 });
  } catch (error) {
    console.error('Error in SOPs POST:', error);
    return NextResponse.json({ 
      success: false, 
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}