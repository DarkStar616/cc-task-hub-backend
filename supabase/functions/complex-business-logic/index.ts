import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "@shared/cors.ts";
import { Database } from "@shared/database.types.ts";
import { logAuditAction } from "@shared/audit-logger.ts";

interface BulkTaskAssignmentRequest {
  operation: "bulk_task_assignment";
  task_ids: string[];
  user_id: string;
  assigned_by: string;
}

interface CascadeTaskCompletionRequest {
  operation: "cascade_task_completion";
  task_id: string;
  completed_by: string;
}

interface DepartmentPerformanceAnalysisRequest {
  operation: "department_performance_analysis";
  department_id: string;
  start_date: string;
  end_date: string;
}

interface UserWorkloadBalancingRequest {
  operation: "user_workload_balancing";
  department_id: string;
  requested_by: string;
}

interface AutomatedTaskEscalationRequest {
  operation: "automated_task_escalation";
  overdue_hours: number;
  department_id?: string;
}

interface BatchReminderCreationRequest {
  operation: "batch_reminder_creation";
  task_ids: string[];
  reminder_type: "deadline" | "overdue" | "follow_up";
  scheduled_for: string;
  created_by: string;
}

type BusinessLogicRequest =
  | BulkTaskAssignmentRequest
  | CascadeTaskCompletionRequest
  | DepartmentPerformanceAnalysisRequest
  | UserWorkloadBalancingRequest
  | AutomatedTaskEscalationRequest
  | BatchReminderCreationRequest;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient<Database>(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_KEY") ?? "",
    );

    const requestData: BusinessLogicRequest = await req.json();
    let result;

    switch (requestData.operation) {
      case "bulk_task_assignment":
        result = await handleBulkTaskAssignment(supabase, requestData);
        break;
      case "cascade_task_completion":
        result = await handleCascadeTaskCompletion(supabase, requestData);
        break;
      case "department_performance_analysis":
        result = await handleDepartmentPerformanceAnalysis(
          supabase,
          requestData,
        );
        break;
      case "user_workload_balancing":
        result = await handleUserWorkloadBalancing(supabase, requestData);
        break;
      case "automated_task_escalation":
        result = await handleAutomatedTaskEscalation(supabase, requestData);
        break;
      case "batch_reminder_creation":
        result = await handleBatchReminderCreation(supabase, requestData);
        break;
      default:
        throw new Error(`Unknown operation: ${(requestData as any).operation}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("Complex business logic error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});

async function handleBulkTaskAssignment(
  supabase: any,
  request: BulkTaskAssignmentRequest,
) {
  const { task_ids, user_id, assigned_by } = request;

  // Verify user exists and is active
  const { data: user, error: userError } = await supabase
    .from("users")
    .select("id, role_id, department_id")
    .eq("id", user_id)
    .eq("status", "active")
    .single();

  if (userError || !user) {
    throw new Error("User not found or inactive");
  }

  // Update tasks in bulk
  const { data: updatedTasks, error: updateError } = await supabase
    .from("tasks")
    .update({
      assigned_to: user_id,
      status: "assigned",
      updated_at: new Date().toISOString(),
    })
    .in("id", task_ids)
    .select();

  if (updateError) {
    throw new Error(`Failed to assign tasks: ${updateError.message}`);
  }

  // Log audit actions for each task
  for (const task of updatedTasks) {
    await logAuditAction(supabase, {
      table_name: "tasks",
      record_id: task.id,
      action: "update",
      old_values: { assigned_to: null },
      new_values: { assigned_to: user_id },
      user_id: assigned_by,
    });
  }

  return {
    success: true,
    assigned_tasks: updatedTasks.length,
    user_id,
    message: `Successfully assigned ${updatedTasks.length} tasks to user ${user_id}`,
  };
}

async function handleCascadeTaskCompletion(
  supabase: any,
  request: CascadeTaskCompletionRequest,
) {
  const { task_id, completed_by } = request;

  // Get the task and its dependencies
  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .select("*, sop_id")
    .eq("id", task_id)
    .single();

  if (taskError || !task) {
    throw new Error("Task not found");
  }

  // Mark task as completed
  const { error: completeError } = await supabase
    .from("tasks")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", task_id);

  if (completeError) {
    throw new Error(`Failed to complete task: ${completeError.message}`);
  }

  // Find dependent tasks (tasks that depend on this one)
  const { data: dependentTasks, error: depError } = await supabase
    .from("tasks")
    .select("*")
    .contains("dependencies", [task_id])
    .eq("status", "pending");

  if (depError) {
    console.error("Error finding dependent tasks:", depError);
  }

  let unlockedTasks = [];
  if (dependentTasks && dependentTasks.length > 0) {
    // Check each dependent task to see if all its dependencies are now complete
    for (const depTask of dependentTasks) {
      const dependencies = depTask.dependencies || [];

      // Check if all dependencies are completed
      const { data: completedDeps, error: checkError } = await supabase
        .from("tasks")
        .select("id")
        .in("id", dependencies)
        .eq("status", "completed");

      if (
        !checkError &&
        completedDeps &&
        completedDeps.length === dependencies.length
      ) {
        // All dependencies are complete, unlock this task
        const { error: unlockError } = await supabase
          .from("tasks")
          .update({
            status: "ready",
            updated_at: new Date().toISOString(),
          })
          .eq("id", depTask.id);

        if (!unlockError) {
          unlockedTasks.push(depTask.id);
        }
      }
    }
  }

  // Log audit action
  await logAuditAction(supabase, {
    table_name: "tasks",
    record_id: task_id,
    action: "update",
    old_values: { status: task.status },
    new_values: { status: "completed" },
    user_id: completed_by,
  });

  return {
    success: true,
    completed_task: task_id,
    unlocked_tasks: unlockedTasks,
    message: `Task completed and ${unlockedTasks.length} dependent tasks unlocked`,
  };
}

async function handleDepartmentPerformanceAnalysis(
  supabase: any,
  request: DepartmentPerformanceAnalysisRequest,
) {
  const { department_id, start_date, end_date } = request;

  // Get department info
  const { data: department, error: deptError } = await supabase
    .from("departments")
    .select("name")
    .eq("id", department_id)
    .single();

  if (deptError || !department) {
    throw new Error("Department not found");
  }

  // Get users in department
  const { data: users, error: usersError } = await supabase
    .from("users")
    .select("id, first_name, last_name")
    .eq("department_id", department_id)
    .eq("status", "active");

  if (usersError) {
    throw new Error(`Failed to get department users: ${usersError.message}`);
  }

  const userIds = users.map((u) => u.id);

  // Get tasks completed in date range
  const { data: completedTasks, error: tasksError } = await supabase
    .from("tasks")
    .select("*")
    .in("assigned_to", userIds)
    .eq("status", "completed")
    .gte("completed_at", start_date)
    .lte("completed_at", end_date);

  if (tasksError) {
    throw new Error(`Failed to get completed tasks: ${tasksError.message}`);
  }

  // Get overdue tasks
  const { data: overdueTasks, error: overdueError } = await supabase
    .from("tasks")
    .select("*")
    .in("assigned_to", userIds)
    .in("status", ["assigned", "in_progress"])
    .lt("due_date", new Date().toISOString());

  if (overdueError) {
    throw new Error(`Failed to get overdue tasks: ${overdueError.message}`);
  }

  // Calculate metrics
  const totalCompleted = completedTasks?.length || 0;
  const totalOverdue = overdueTasks?.length || 0;
  const avgCompletionTime =
    completedTasks?.length > 0
      ? completedTasks.reduce((sum, task) => {
          const created = new Date(task.created_at).getTime();
          const completed = new Date(task.completed_at).getTime();
          return sum + (completed - created);
        }, 0) /
        completedTasks.length /
        (1000 * 60 * 60 * 24) // Convert to days
      : 0;

  // User performance breakdown
  const userPerformance = users.map((user) => {
    const userCompleted =
      completedTasks?.filter((t) => t.assigned_to === user.id).length || 0;
    const userOverdue =
      overdueTasks?.filter((t) => t.assigned_to === user.id).length || 0;

    return {
      user_id: user.id,
      name: `${user.first_name} ${user.last_name}`,
      completed_tasks: userCompleted,
      overdue_tasks: userOverdue,
      completion_rate:
        userCompleted + userOverdue > 0
          ? ((userCompleted / (userCompleted + userOverdue)) * 100).toFixed(1)
          : "0",
    };
  });

  const analysis = {
    department_id,
    department_name: department.name,
    period: { start_date, end_date },
    metrics: {
      total_completed_tasks: totalCompleted,
      total_overdue_tasks: totalOverdue,
      completion_rate:
        totalCompleted + totalOverdue > 0
          ? ((totalCompleted / (totalCompleted + totalOverdue)) * 100).toFixed(
              1,
            )
          : "0",
      avg_completion_time_days: avgCompletionTime.toFixed(1),
      active_users: users.length,
    },
    user_performance: userPerformance,
    generated_at: new Date().toISOString(),
  };

  // Store analysis in analytics table
  const { error: analyticsError } = await supabase.from("analytics").insert({
    metric_name: "department_performance_analysis",
    metric_value: analysis.metrics.completion_rate,
    metadata: analysis,
    recorded_at: new Date().toISOString(),
  });

  if (analyticsError) {
    console.error("Failed to store analysis:", analyticsError);
  }

  return {
    success: true,
    analysis,
  };
}

async function handleUserWorkloadBalancing(
  supabase: any,
  request: UserWorkloadBalancingRequest,
) {
  const { department_id, requested_by } = request;

  // Get active users in department
  const { data: users, error: usersError } = await supabase
    .from("users")
    .select("id, first_name, last_name")
    .eq("department_id", department_id)
    .eq("status", "active");

  if (usersError || !users || users.length === 0) {
    throw new Error("No active users found in department");
  }

  // Get current task assignments for each user
  const userWorkloads = await Promise.all(
    users.map(async (user) => {
      const { data: tasks, error } = await supabase
        .from("tasks")
        .select("id, priority, due_date")
        .eq("assigned_to", user.id)
        .in("status", ["assigned", "in_progress"]);

      if (error) {
        console.error(`Error getting tasks for user ${user.id}:`, error);
        return {
          user,
          task_count: 0,
          high_priority_count: 0,
          overdue_count: 0,
        };
      }

      const now = new Date();
      const highPriorityCount =
        tasks?.filter((t) => t.priority === "high").length || 0;
      const overdueCount =
        tasks?.filter((t) => new Date(t.due_date) < now).length || 0;

      return {
        user,
        task_count: tasks?.length || 0,
        high_priority_count: highPriorityCount,
        overdue_count: overdueCount,
        workload_score:
          (tasks?.length || 0) + highPriorityCount * 2 + overdueCount * 3,
      };
    }),
  );

  // Sort by workload score
  userWorkloads.sort((a, b) => a.workload_score - b.workload_score);

  const underloadedUsers = userWorkloads.filter((u) => u.workload_score < 5);
  const overloadedUsers = userWorkloads.filter((u) => u.workload_score > 15);

  // Get unassigned tasks that could be redistributed
  const { data: unassignedTasks, error: unassignedError } = await supabase
    .from("tasks")
    .select("*")
    .is("assigned_to", null)
    .eq("status", "ready")
    .order("priority", { ascending: false })
    .order("due_date", { ascending: true })
    .limit(10);

  if (unassignedError) {
    console.error("Error getting unassigned tasks:", unassignedError);
  }

  const recommendations = [];

  // Recommend assigning unassigned tasks to underloaded users
  if (
    unassignedTasks &&
    unassignedTasks.length > 0 &&
    underloadedUsers.length > 0
  ) {
    let taskIndex = 0;
    for (const user of underloadedUsers) {
      if (taskIndex >= unassignedTasks.length) break;

      const tasksToAssign = Math.min(3, unassignedTasks.length - taskIndex);
      const tasks = unassignedTasks.slice(taskIndex, taskIndex + tasksToAssign);

      recommendations.push({
        type: "assign_unassigned",
        user_id: user.user.id,
        user_name: `${user.user.first_name} ${user.user.last_name}`,
        current_workload: user.workload_score,
        recommended_tasks: tasks.map((t) => ({
          id: t.id,
          title: t.title,
          priority: t.priority,
        })),
      });

      taskIndex += tasksToAssign;
    }
  }

  // Recommend redistributing tasks from overloaded to underloaded users
  if (overloadedUsers.length > 0 && underloadedUsers.length > 0) {
    for (const overloadedUser of overloadedUsers.slice(0, 2)) {
      const { data: redistributableTasks, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("assigned_to", overloadedUser.user.id)
        .in("status", ["assigned"])
        .eq("priority", "low")
        .order("due_date", { ascending: false })
        .limit(3);

      if (!error && redistributableTasks && redistributableTasks.length > 0) {
        const targetUser = underloadedUsers[0];
        recommendations.push({
          type: "redistribute",
          from_user_id: overloadedUser.user.id,
          from_user_name: `${overloadedUser.user.first_name} ${overloadedUser.user.last_name}`,
          to_user_id: targetUser.user.id,
          to_user_name: `${targetUser.user.first_name} ${targetUser.user.last_name}`,
          tasks_to_move: redistributableTasks.map((t) => ({
            id: t.id,
            title: t.title,
            priority: t.priority,
          })),
        });
      }
    }
  }

  // Log the workload analysis
  await logAuditAction(supabase, {
    table_name: "analytics",
    record_id: department_id,
    action: "create",
    old_values: {},
    new_values: { workload_analysis: userWorkloads },
    user_id: requested_by,
  });

  return {
    success: true,
    department_id,
    user_workloads: userWorkloads.map((u) => ({
      user_id: u.user.id,
      name: `${u.user.first_name} ${u.user.last_name}`,
      current_tasks: u.task_count,
      high_priority_tasks: u.high_priority_count,
      overdue_tasks: u.overdue_count,
      workload_score: u.workload_score,
      status:
        u.workload_score < 5
          ? "underloaded"
          : u.workload_score > 15
            ? "overloaded"
            : "balanced",
    })),
    recommendations,
    summary: {
      total_users: users.length,
      underloaded_users: underloadedUsers.length,
      overloaded_users: overloadedUsers.length,
      balanced_users:
        users.length - underloadedUsers.length - overloadedUsers.length,
    },
  };
}

async function handleAutomatedTaskEscalation(
  supabase: any,
  request: AutomatedTaskEscalationRequest,
) {
  const { overdue_hours, department_id } = request;

  const overdueThreshold = new Date();
  overdueThreshold.setHours(overdueThreshold.getHours() - overdue_hours);

  // Build query for overdue tasks
  let query = supabase
    .from("tasks")
    .select(
      `
      *,
      assigned_user:users!tasks_assigned_to_fkey(id, first_name, last_name, email, role_id),
      sop:sops(title, department_id)
    `,
    )
    .in("status", ["assigned", "in_progress"])
    .lt("due_date", overdueThreshold.toISOString());

  if (department_id) {
    // Filter by department through the SOP relationship
    query = query.eq("sops.department_id", department_id);
  }

  const { data: overdueTasks, error: overdueError } = await query;

  if (overdueError) {
    throw new Error(`Failed to get overdue tasks: ${overdueError.message}`);
  }

  if (!overdueTasks || overdueTasks.length === 0) {
    return {
      success: true,
      escalated_tasks: 0,
      message: "No overdue tasks found for escalation",
    };
  }

  const escalatedTasks = [];

  for (const task of overdueTasks) {
    // Get the user's manager or department head
    const { data: managers, error: managerError } = await supabase
      .from("users")
      .select("id, first_name, last_name, email")
      .eq("department_id", task.sop?.department_id)
      .in("role_id", ["manager", "admin"])
      .eq("status", "active")
      .limit(1);

    if (managerError || !managers || managers.length === 0) {
      console.error(`No manager found for task ${task.id}`);
      continue;
    }

    const manager = managers[0];

    // Create escalation record in audit_logs
    await logAuditAction(supabase, {
      table_name: "tasks",
      record_id: task.id,
      action: "escalate",
      old_values: { status: task.status },
      new_values: {
        escalated_to: manager.id,
        escalated_at: new Date().toISOString(),
      },
      user_id: "system",
    });

    // Update task with escalation info
    const { error: updateError } = await supabase
      .from("tasks")
      .update({
        priority: task.priority === "high" ? "critical" : "high",
        updated_at: new Date().toISOString(),
      })
      .eq("id", task.id);

    if (updateError) {
      console.error(`Failed to update task ${task.id}:`, updateError);
      continue;
    }

    // Create reminder for manager
    const { error: reminderError } = await supabase.from("reminders").insert({
      user_id: manager.id,
      task_id: task.id,
      type: "escalation",
      message: `Task "${task.title}" has been escalated due to being overdue by ${overdue_hours} hours. Originally assigned to ${task.assigned_user?.first_name} ${task.assigned_user?.last_name}.`,
      scheduled_for: new Date().toISOString(),
      status: "pending",
    });

    if (reminderError) {
      console.error(
        `Failed to create reminder for task ${task.id}:`,
        reminderError,
      );
    }

    escalatedTasks.push({
      task_id: task.id,
      task_title: task.title,
      original_assignee: task.assigned_user
        ? `${task.assigned_user.first_name} ${task.assigned_user.last_name}`
        : "Unassigned",
      escalated_to: `${manager.first_name} ${manager.last_name}`,
      overdue_by_hours: Math.floor(
        (new Date().getTime() - new Date(task.due_date).getTime()) /
          (1000 * 60 * 60),
      ),
      new_priority: task.priority === "high" ? "critical" : "high",
    });
  }

  return {
    success: true,
    escalated_tasks: escalatedTasks.length,
    tasks: escalatedTasks,
    message: `Successfully escalated ${escalatedTasks.length} overdue tasks`,
  };
}

async function handleBatchReminderCreation(
  supabase: any,
  request: BatchReminderCreationRequest,
) {
  const { task_ids, reminder_type, scheduled_for, created_by } = request;

  // Get tasks and their assigned users
  const { data: tasks, error: tasksError } = await supabase
    .from("tasks")
    .select(
      `
      id,
      title,
      due_date,
      assigned_to,
      assigned_user:users!tasks_assigned_to_fkey(id, first_name, last_name, email)
    `,
    )
    .in("id", task_ids)
    .not("assigned_to", "is", null);

  if (tasksError) {
    throw new Error(`Failed to get tasks: ${tasksError.message}`);
  }

  if (!tasks || tasks.length === 0) {
    throw new Error("No valid tasks found with assigned users");
  }

  const reminders = [];
  const reminderMessages = {
    deadline: (task: any) =>
      `Reminder: Task "${task.title}" is due on ${new Date(task.due_date).toLocaleDateString()}.`,
    overdue: (task: any) =>
      `OVERDUE: Task "${task.title}" was due on ${new Date(task.due_date).toLocaleDateString()}. Please complete as soon as possible.`,
    follow_up: (task: any) =>
      `Follow-up: Please provide an update on the status of task "${task.title}".`,
  };

  for (const task of tasks) {
    if (!task.assigned_user) continue;

    const reminderData = {
      user_id: task.assigned_to,
      task_id: task.id,
      type: reminder_type,
      message: reminderMessages[reminder_type](task),
      scheduled_for: scheduled_for,
      status: "pending" as const,
      created_at: new Date().toISOString(),
    };

    reminders.push(reminderData);
  }

  // Insert reminders in batch
  const { data: createdReminders, error: insertError } = await supabase
    .from("reminders")
    .insert(reminders)
    .select();

  if (insertError) {
    throw new Error(`Failed to create reminders: ${insertError.message}`);
  }

  // Log audit action
  await logAuditAction(supabase, {
    table_name: "reminders",
    record_id: "batch_creation",
    action: "create",
    old_values: {},
    new_values: {
      reminder_count: createdReminders?.length || 0,
      reminder_type,
      task_ids,
    },
    user_id: created_by,
  });

  return {
    success: true,
    created_reminders: createdReminders?.length || 0,
    reminder_type,
    scheduled_for,
    tasks_with_reminders: tasks.map((task) => ({
      task_id: task.id,
      task_title: task.title,
      assigned_to: task.assigned_user
        ? `${task.assigned_user.first_name} ${task.assigned_user.last_name}`
        : "Unknown",
      reminder_message: reminderMessages[reminder_type](task),
    })),
    message: `Successfully created ${createdReminders?.length || 0} ${reminder_type} reminders`,
  };
}
