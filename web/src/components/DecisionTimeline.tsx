import React from 'react'
import { Decision } from '../types'
import { Lightbulb } from 'lucide-react'

interface DecisionTimelineProps {
  decisions: Decision[]
}

const DecisionTimeline: React.FC<DecisionTimelineProps> = ({ decisions }) => {
  const sorted = [...decisions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
        <Lightbulb className="w-6 h-6 text-amber-500" /> Decision Timeline
      </h2>

      {sorted.length === 0 ? (
        <p className="text-gray-500 text-center py-8">No decisions recorded yet</p>
      ) : (
        <div className="relative">
          <div className="absolute left-8 top-0 bottom-0 w-1 bg-gradient-to-b from-amber-300 to-amber-500" />

          <div className="space-y-6 pl-24">
            {sorted.map((decision, idx) => (
              <div key={idx} className="relative">
                <div className="absolute left-[-24px] top-2 w-5 h-5 bg-white border-4 border-amber-500 rounded-full" />

                <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h4 className="font-semibold text-gray-900">{decision.topic}</h4>
                      <p className="text-xs text-gray-500">{formatDate(decision.date)} • {decision.agent}</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Decision</p>
                      <p className="text-sm text-gray-900 mt-1">{decision.decision}</p>
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Reasoning</p>
                      <p className="text-sm text-gray-700 mt-1">{decision.reasoning}</p>
                    </div>

                    {decision.trade_offs && (
                      <div>
                        <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Trade-offs</p>
                        <p className="text-sm text-gray-600 mt-1">{decision.trade_offs}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default DecisionTimeline
