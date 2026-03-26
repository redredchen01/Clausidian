import React from 'react'
import { Task } from '../types'
import { CheckCircle2, Circle, Clock } from 'lucide-react'

interface TaskBoardProps {
  tasks: Task[]
}

const TaskBoard: React.FC<TaskBoardProps> = ({ tasks }) => {
  const pending = tasks.filter(t => t.status === 'pending')
  const inProgress = tasks.filter(t => t.status === 'in_progress')
  const completed = tasks.filter(t => t.status === 'completed')

  const TaskCard: React.FC<{ task: Task }> = ({ task }) => (
    <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-2">
        <h4 className="font-semibold text-sm text-gray-900 flex-1">{task.id}</h4>
        {task.status === 'completed' && <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />}
        {task.status === 'in_progress' && <Clock className="w-5 h-5 text-blue-600 flex-shrink-0" />}
        {task.status === 'pending' && <Circle className="w-5 h-5 text-gray-400 flex-shrink-0" />}
      </div>
      <p className="text-xs text-gray-600 mb-2">{task.description}</p>
      {task.assigned_to && (
        <p className="text-xs text-blue-600 font-medium">👤 {task.assigned_to}</p>
      )}
      {task.depends_on.length > 0 && (
        <p className="text-xs text-gray-500 mt-1">depends: {task.depends_on.join(', ')}</p>
      )}
    </div>
  )

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Circle className="w-5 h-5 text-gray-400" /> Pending ({pending.length})
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {pending.length > 0 ? pending.map(task => (
            <TaskCard key={task.id} task={task} />
          )) : (
            <p className="text-sm text-gray-500 col-span-full">No pending tasks</p>
          )}
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <Clock className="w-5 h-5 text-blue-600" /> In Progress ({inProgress.length})
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {inProgress.length > 0 ? inProgress.map(task => (
            <TaskCard key={task.id} task={task} />
          )) : (
            <p className="text-sm text-gray-500 col-span-full">No tasks in progress</p>
          )}
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-green-600" /> Completed ({completed.length})
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {completed.length > 0 ? completed.map(task => (
            <TaskCard key={task.id} task={task} />
          )) : (
            <p className="text-sm text-gray-500 col-span-full">No completed tasks yet</p>
          )}
        </div>
      </div>
    </div>
  )
}

export default TaskBoard
