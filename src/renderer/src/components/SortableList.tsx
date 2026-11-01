import { useEffect, useState, type ComponentProps, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { DragDropProvider, DragOverlay } from '@dnd-kit/react'
import { isSortable, useSortable } from '@dnd-kit/react/sortable'
import {
  Accessibility,
  Feedback,
  KeyboardSensor,
  PointerActivationConstraints,
  PointerSensor
} from '@dnd-kit/dom'
import { RestrictToVerticalAxis } from '@dnd-kit/abstract/modifiers'
import { RestrictToWindow } from '@dnd-kit/dom/modifiers'
import { GripVertical } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'

interface SortableItem {
  id: string
  label: string
}

export type SortableHandleProps = Pick<
  ComponentProps<typeof Button>,
  'ref' | 'onKeyDown' | 'aria-disabled' | 'title'
>

interface SortableListProps {
  items: SortableItem[]
  label: string
  disabled: boolean
  onMove: (id: string, targetId: string) => Promise<void>
  renderItem: (id: string, handle: ReactNode) => ReactNode
  renderHandle?: (id: string, props: SortableHandleProps) => ReactNode
  className?: string
  itemClassName?: string
  handleClassName?: string
}

const animation = { duration: 200, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }
const instructions =
  '拖动排序；或按空格提起、上下键移动、空格放下，Esc 取消；Alt 加上下键可直接移动'

export function SortableList({
  items,
  label,
  disabled,
  onMove,
  renderItem,
  renderHandle,
  className,
  itemClassName,
  handleClassName
}: SortableListProps): React.JSX.Element {
  const [dragging, setDragging] = useState(false)
  const [preview, setPreview] = useState<{ content: ReactNode; width: number } | null>(null)
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
  const handleInstructions = renderHandle
    ? '点击打开；直接拖动调整顺序，也可按 Alt 加上下方向键移动'
    : instructions

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

  return (
    <DragDropProvider
      sensors={(defaults) => [
        ...defaults.filter(
          (sensor) => sensor !== PointerSensor && (!renderHandle || sensor !== KeyboardSensor)
        ),
        // Navigation buttons keep their native Enter/Space action; Alt+arrows reorder them.
        ...(renderHandle ? [KeyboardSensor.configure({ preventActivation: () => true })] : []),
        PointerSensor.configure({
          activationConstraints: [new PointerActivationConstraints.Distance({ value: 5 })]
        })
      ]}
      modifiers={(defaults) => [...defaults, RestrictToVerticalAxis, RestrictToWindow]}
      plugins={(defaults) => [
        ...defaults,
        Feedback.configure({ keyboardTransition: reducedMotion ? null : animation }),
        Accessibility.configure({
          screenReaderInstructions: { draggable: handleInstructions },
          announcements: {
            dragstart: ({ operation: { source } }) =>
              isSortable(source)
                ? `已提起 ${items.find((item) => item.id === source.id)?.label ?? ''}，当前位置第 ${source.initialIndex + 1} 位。`
                : undefined,
            dragover: ({ operation: { source } }) =>
              isSortable(source) ? `松开后放在第 ${source.index + 1} 位。` : undefined,
            dragend: ({ canceled }) =>
              canceled ? '已取消排序，保持原顺序。' : '已放下，正在保存顺序。'
          }
        })
      ]}
      onBeforeDragStart={(event) => {
        const source = event.operation.source
        const item = items.find((item) => item.id === source?.id)
        const rect = source?.element?.getBoundingClientRect()
        if (disabled || !item || !rect) {
          event.preventDefault()
          return
        }
        setPreview({
          content: renderItem(
            item.id,
            renderHandle ? (
              renderHandle(item.id, {})
            ) : (
              <span
                className={cn('flex size-8 shrink-0 items-center justify-center', handleClassName)}
              >
                <GripVertical className="size-4 text-muted-foreground" />
              </span>
            )
          ),
          width: rect.width
        })
      }}
      onDragStart={() => setDragging(true)}
      onDragEnd={({ operation: { source }, canceled }) => {
        setDragging(false)
        if (canceled || disabled || !isSortable(source) || source.initialIndex === source.index)
          return
        const target = items[source.index]
        if (!target) return
        // Match React's keys to dnd-kit's optimistic DOM before persistence or rollback.
        flushSync(() => void onMove(String(source.id), target.id))
      }}
    >
      <ul className={cn('m-0 list-none space-y-3 p-0', className)} aria-label={label}>
        {items.map((item, index) => (
          <SortableListItem
            key={item.id}
            item={item}
            index={index}
            items={items}
            disabled={disabled || items.length < 2}
            dragging={dragging}
            reducedMotion={reducedMotion}
            onMove={onMove}
            renderItem={renderItem}
            renderHandle={renderHandle}
            handleInstructions={handleInstructions}
            className={itemClassName}
            handleClassName={handleClassName}
          />
        ))}
      </ul>
      <DragOverlay dropAnimation={reducedMotion ? null : animation}>
        {preview && (
          <div
            aria-hidden="true"
            inert
            className={cn(
              'pointer-events-none rounded-xl bg-card text-card-foreground shadow-xl ring-2 ring-primary/25',
              itemClassName
            )}
            style={{ width: preview.width }}
          >
            {preview.content}
          </div>
        )}
      </DragOverlay>
    </DragDropProvider>
  )
}

function SortableListItem({
  item,
  index,
  items,
  disabled,
  dragging,
  reducedMotion,
  onMove,
  renderItem,
  renderHandle,
  handleInstructions,
  className,
  handleClassName
}: {
  item: SortableItem
  index: number
  items: SortableItem[]
  disabled: boolean
  dragging: boolean
  reducedMotion: boolean
  onMove: SortableListProps['onMove']
  renderItem: SortableListProps['renderItem']
  renderHandle: SortableListProps['renderHandle']
  handleInstructions: string
  className?: string
  handleClassName?: string
}): React.JSX.Element {
  const { ref, handleRef, isDragSource, isDropping } = useSortable({
    id: item.id,
    index,
    disabled,
    transition: reducedMotion ? null : animation
  })
  const handleProps: SortableHandleProps = {
    ref: handleRef,
    'aria-disabled': disabled,
    title: handleInstructions,
    onKeyDown: (event) => {
      if (disabled || dragging || isDropping || !event.altKey) return
      if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return
      event.preventDefault()
      const target = items[index + (event.key === 'ArrowUp' ? -1 : 1)]
      if (target) void onMove(item.id, target.id)
    }
  }

  return (
    <li
      ref={ref}
      data-drag-placeholder={isDragSource || undefined}
      className={cn('sortable-list-item min-w-0 rounded-xl', className)}
    >
      {renderItem(
        item.id,
        renderHandle ? (
          renderHandle(item.id, handleProps)
        ) : (
          <Button
            {...handleProps}
            type="button"
            size="icon"
            variant="ghost"
            className={cn(
              'touch-none cursor-grab text-muted-foreground active:cursor-grabbing aria-disabled:cursor-default aria-disabled:opacity-40',
              handleClassName
            )}
            aria-label={`调整 ${item.label} 顺序，当前位置 ${index + 1}`}
          >
            <GripVertical aria-hidden="true" />
          </Button>
        )
      )}
    </li>
  )
}
