import type { AppSettings, CloseBehavior } from '@shared/ipc'
import { Card, CardContent } from '@renderer/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'

export function GeneralSettings({
  settings,
  busy,
  onCloseBehaviorChange
}: {
  settings: AppSettings
  busy: boolean
  onCloseBehaviorChange: (behavior: CloseBehavior) => void
}): React.JSX.Element {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">应用设置</h2>
      </div>
      <Card>
        <CardContent>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-medium">点击窗口关闭按钮时</p>
            <Select
              value={settings.closeBehavior}
              disabled={busy}
              onValueChange={(value) => {
                if (value === 'tray' || value === 'quit') onCloseBehaviorChange(value)
              }}
            >
              <SelectTrigger className="w-full sm:w-52" aria-label="关闭窗口后的行为">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="tray">最小化到系统托盘</SelectItem>
                <SelectItem value="quit">退出应用程序</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
