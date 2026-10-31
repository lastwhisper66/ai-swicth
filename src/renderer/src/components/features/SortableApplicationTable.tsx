import { useEffect, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { DragDropProvider, DragOverlay, type BeforeDragStartEvent } from '@dnd-kit/react'
import { isSortable, useSortable } from '@dnd-kit/react/sortable'
import { Accessibility, Feedback, PointerActivationConstraints, PointerSensor } from '@dnd-kit/dom'
import { RestrictToVerticalAxis } from '@dnd-kit/abstract/modifiers'
import { RestrictToWindow } from '@dnd-kit/dom/modifiers'
import { GripVertical } from 'lucide-react'
import {
  getApplicationDefinition,
  isWslApplication,
  type ApplicationId
} from '@shared/applications'
import { Button } from '@renderer/components/ui/button'

interface SortableApplicationTableProps {
  order: ApplicationId[]
  disabled: boolean
  onMove: (applicationId: ApplicationId, targetId: ApplicationId) => Promise<void>
  renderRow: (applicationId: ApplicationId, handle: ReactNode, overlay: boolean) => ReactNode
}

interface DragPreview {
  content: ReactNode
  width: number
  height: number
}

const animation = { duration: 200, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }

export function SortableApplicationTable({
  order,
  disabled,
  onMove,
  renderRow
}: SortableApplicationTableProps): React.JSX.Element {
  const [preview, setPreview] = useState<DragPreview | null>(null)
  const [dragging, setDragging] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = (): void => setReducedMotion(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (!dragging) return
    document.body.classList.add('application-sorting')
    return () => document.body.classList.remove('application-sorting')
  }, [dragging])

  function prepareDrag(event: BeforeDragStartEvent): void {
    const { source } = event.operation
    const id = source?.id as ApplicationId | undefined
    const rect = source?.element?.getBoundingClientRect()
    if (disabled || !id || !order.includes(id) || !rect) {
      event.preventDefault()
      return
    }
    // Freeze the preview so a detection result cannot change its size during a drag.
    setPreview({
      content: renderRow(
        id,
        <GripVertical className="mx-auto size-3 text-muted-foreground" />,
        true
      ),
      width: rect.width,
      height: rect.height
    })
  }

  return (
    <DragDropProvider
      sensors={(defaults) => [
        ...defaults.filter((sensor) => sensor !== PointerSensor),
        PointerSensor.configure({
          activationConstraints: [new PointerActivationConstraints.Distance({ value: 5 })]
        })
      ]}
      modifiers={(defaults) => [...defaults, RestrictToVerticalAxis, RestrictToWindow]}
      plugins={(defaults) => [
        ...defaults,
        Feedback.configure({ keyboardTransition: reducedMotion ? null : animation }),
        Accessibility.configure({
          screenReaderInstructions: {
            draggable:
              '按空格或回车提起应用，使用上下方向键调整位置，再按空格或回车放下；按 Escape 取消。也可按 Alt 加上下方向键直接移动。'
          },
          announcements: {
            dragstart: ({ operation: { source } }) =>
              isSortable(source)
                ? `已提起 ${applicationLabel(source.id as ApplicationId)}，当前位置第 ${source.initialIndex + 1} 位。`
                : undefined,
            dragover: ({ operation: { source } }) =>
              isSortable(source) ? `松开后放在第 ${source.index + 1} 位。` : undefined,
            dragend: ({ operation: { source }, canceled }) =>
              canceled
                ? '已取消排序，保持原顺序。'
                : isSortable(source)
                  ? `${applicationLabel(source.id as ApplicationId)} 已放到第 ${source.index + 1} 位。`
                  : undefined
          }
        })
      ]}
      onBeforeDragStart={prepareDrag}
      onDragStart={() => setDragging(true)}
      onDragEnd={({ operation: { source }, canceled }) => {
        setDragging(false)
        // Keep preview content mounted until DragOverlay finishes its drop animation.
        if (canceled || disabled || !isSortable(source) || source.initialIndex === source.index)
          return
        const targetId = order[source.index]
        if (!targetId) return
        // Commit React's key order before saving, so even a fast save failure can roll back
        // the DOM order already changed by the optimistic sorting plugin.
        flushSync(() => void onMove(source.id as ApplicationId, targetId))
      }}
    >
      <section aria-label="AI 应用列表" className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[42rem] table-fixed border-collapse text-left">
          <ApplicationColumns />
          <thead className="border-b bg-muted/25 text-xs text-muted-foreground">
            <tr>
              <th scope="col">
                <span className="sr-only">排序</span>
              </th>
              <th scope="col" className="px-3 py-2 text-left font-normal">
                应用
              </th>
              <th scope="col" className="py-2 text-center font-normal">
                shell
              </th>
              <th scope="col" className="py-2 text-center font-normal">
                版本 / 状态
              </th>
              <th scope="col" className="py-2 text-center font-normal">
                显示
              </th>
              <th scope="col" className="py-2 text-center font-normal">
                详情
              </th>
              <th scope="col" className="py-2 text-center font-normal">
                检查更新
              </th>
              <th scope="col" className="py-2 pr-2 text-right font-normal">
                操作
              </th>
            </tr>
          </thead>
          {order.map((id, index) => (
            <SortableApplicationGroup
              key={id}
              id={id}
              index={index}
              order={order}
              disabled={disabled}
              dragging={dragging}
              reducedMotion={reducedMotion}
              onMove={onMove}
              renderRow={renderRow}
            />
          ))}
        </table>
      </section>
      <DragOverlay dropAnimation={reducedMotion ? null : animation}>
        {(source) =>
          preview && (
            <div
              aria-hidden="true"
              inert
              className="pointer-events-none relative rounded-lg bg-card text-card-foreground shadow-xl ring-2 ring-primary/30"
              style={{ width: preview.width, minHeight: preview.height }}
            >
              <span className="absolute -top-3 right-3 rounded-md bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground shadow-sm">
                {isSortable(source) ? `松开放到第 ${source.index + 1} 位` : '正在调整顺序'}
              </span>
              <table className="w-full table-fixed border-collapse text-left">
                <ApplicationColumns />
                <tbody>{preview.content}</tbody>
              </table>
            </div>
          )
        }
      </DragOverlay>
    </DragDropProvider>
  )
}

function SortableApplicationGroup({
  id,
  index,
  order,
  disabled,
  dragging,
  reducedMotion,
  onMove,
  renderRow
}: {
  id: ApplicationId
  index: number
  order: ApplicationId[]
  disabled: boolean
  dragging: boolean
  reducedMotion: boolean
  onMove: SortableApplicationTableProps['onMove']
  renderRow: SortableApplicationTableProps['renderRow']
}): React.JSX.Element {
  const { ref, handleRef, isDragSource, isDropping } = useSortable({
    id,
    index,
    group: 'ai-applications',
    disabled,
    transition: reducedMotion ? null : animation
  })
  const handle = (
    <Button
      ref={handleRef}
      size="icon-xs"
      variant="ghost"
      className="touch-none cursor-grab text-muted-foreground active:cursor-grabbing aria-disabled:cursor-default aria-disabled:opacity-40"
      aria-label={`调整 ${applicationLabel(id)} 顺序，当前位置 ${index + 1}`}
      aria-disabled={disabled}
      title="拖动排序；或按空格提起、上下键移动、空格放下，Esc 取消"
      onKeyDown={(event) => {
        if (disabled || dragging || isDropping) return
        if (event.altKey && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
          event.preventDefault()
          const target = order[index + (event.key === 'ArrowUp' ? -1 : 1)]
          if (target) void onMove(id, target)
          return
        }
      }}
    >
      <GripVertical />
    </Button>
  )

  return (
    <tbody
      ref={ref}
      data-drag-placeholder={isDragSource || undefined}
      className="application-sortable border-b bg-card last:border-b-0"
    >
      {renderRow(id, handle, false)}
    </tbody>
  )
}

function ApplicationColumns(): React.JSX.Element {
  return (
    <colgroup>
      <col className="w-8" />
      <col />
      <col className="w-20" />
      <col className="w-20 md:w-24" />
      <col className="w-10 md:w-12" />
      <col className="w-12" />
      <col className="w-16" />
      <col className="w-24" />
    </colgroup>
  )
}

function applicationLabel(id: ApplicationId): string {
  return `${getApplicationDefinition(id).name}${isWslApplication(id) ? ' WSL' : ''}`
}
