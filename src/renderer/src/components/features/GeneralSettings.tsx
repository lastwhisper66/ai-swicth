import type { AppSettings, CloseBehavior } from '@shared/ipc'
import { Card, CardContent } from '@renderer/components/ui/card'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet
} from '@renderer/components/ui/field'
import { RadioGroup, RadioGroupItem } from '@renderer/components/ui/radio-group'

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
        <p className="mt-1 text-sm text-muted-foreground">选择关闭窗口后的行为，修改后自动保存。</p>
      </div>
      <Card>
        <CardContent>
          <FieldSet>
            <FieldLegend>点击窗口关闭按钮时</FieldLegend>
            <RadioGroup
              value={settings.closeBehavior}
              disabled={busy}
              onValueChange={(value) => {
                if (value === 'tray' || value === 'quit') onCloseBehaviorChange(value)
              }}
              aria-label="关闭窗口后的行为"
            >
              <Field orientation="horizontal" className="rounded-lg border p-4">
                <FieldContent className="min-w-0">
                  <FieldLabel htmlFor="close-to-tray">最小化到系统托盘</FieldLabel>
                  <FieldDescription>
                    隐藏窗口并在任务栏通知区域保留图标。点击托盘图标恢复窗口，右键可退出应用程序。
                  </FieldDescription>
                </FieldContent>
                <RadioGroupItem value="tray" id="close-to-tray" className="self-center" />
              </Field>
              <Field orientation="horizontal" className="rounded-lg border p-4">
                <FieldContent className="min-w-0">
                  <FieldLabel htmlFor="close-to-quit">直接退出应用程序</FieldLabel>
                  <FieldDescription>关闭窗口时结束应用进程，移除托盘图标。</FieldDescription>
                </FieldContent>
                <RadioGroupItem value="quit" id="close-to-quit" className="self-center" />
              </Field>
            </RadioGroup>
          </FieldSet>
        </CardContent>
      </Card>
    </div>
  )
}
