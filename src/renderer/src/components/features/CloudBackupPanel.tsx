import { useEffect, useRef, useState } from 'react'
import { Cloud, Eye, EyeOff, RefreshCw, Save, Upload, Download } from 'lucide-react'
import type { CloudBackupSettings, CloudBackupSettingsInput } from '@shared/ipc'
import { CLOUD_BACKUP_RETENTION } from '@shared/ipc'
import { Alert, AlertDescription } from '@renderer/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@renderer/components/ui/alert-dialog'
import { Button } from '@renderer/components/ui/button'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel
} from '@renderer/components/ui/field'
import { Input } from '@renderer/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { Spinner } from '@renderer/components/ui/spinner'
import { ConfigurationCheckbox } from './ConfigurationCheckbox'

interface CloudBackupPanelProps {
  settings: CloudBackupSettings
  busy: boolean
  pendingKey: string | null
  onSave: (input: CloudBackupSettingsInput) => Promise<boolean>
  onSavePassword: (password: string) => Promise<boolean>
  onTest: (input: CloudBackupSettingsInput) => void
  onUpload: (password: string) => void
  onRestore: (password: string) => void
}

export function CloudBackupPanel({
  settings,
  busy,
  pendingKey,
  onSave,
  onSavePassword,
  onTest,
  onUpload,
  onRestore
}: CloudBackupPanelProps): React.JSX.Element {
  const [enabled, setEnabled] = useState(settings.enabled)
  const [endpoint, setEndpoint] = useState(settings.endpoint)
  const [region, setRegion] = useState(settings.region)
  const [bucket, setBucket] = useState(settings.bucket)
  const [prefix, setPrefix] = useState(settings.prefix)
  const [retentionCount, setRetentionCount] = useState(settings.retentionCount)
  const [accessKeyId, setAccessKeyId] = useState(settings.accessKeyId)
  const [secretAccessKey, setSecretAccessKey] = useState('')
  const [clearSecret, setClearSecret] = useState(false)
  const [passwordDraft, setPasswordDraft] = useState<string | null>(null)
  const password = passwordDraft ?? settings.encryptionPassword
  const [showSecret, setShowSecret] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const passwordSaveTimer = useRef<number | undefined>(undefined)

  const settingsDirty =
    enabled !== settings.enabled ||
    endpoint.trim() !== settings.endpoint ||
    region.trim() !== settings.region ||
    bucket.trim() !== settings.bucket ||
    prefix.trim() !== settings.prefix ||
    retentionCount !== settings.retentionCount ||
    accessKeyId.trim() !== settings.accessKeyId ||
    secretAccessKey.length > 0 ||
    clearSecret
  const passwordValid = isValidPassword(password)
  const passwordInvalid = password.length > 0 && !passwordValid
  const canOperate = settings.enabled && !settingsDirty && passwordValid && !busy
  const secretLabel = settings.hasSecret ? `已保存 ${settings.maskedSecret}` : '尚未保存'

  useEffect(() => () => window.clearTimeout(passwordSaveTimer.current), [])

  function buildSettingsInput(): CloudBackupSettingsInput {
    return {
      enabled,
      endpoint,
      region,
      bucket,
      prefix,
      retentionCount,
      accessKeyId,
      secretAccessKey:
        secretAccessKey.length > 0
          ? { mode: 'replace', value: secretAccessKey }
          : clearSecret
            ? { mode: 'clear' }
            : { mode: 'keep' }
    }
  }

  async function persistPassword(value: string): Promise<void> {
    const saved = await onSavePassword(value)
    if (saved) setPasswordDraft((current) => (current === value ? null : current))
  }

  function changePassword(value: string): void {
    setPasswordDraft(value)
    window.clearTimeout(passwordSaveTimer.current)
    if (isValidPassword(value) || value.length === 0) {
      passwordSaveTimer.current = window.setTimeout(() => void persistPassword(value), 400)
    }
  }

  function savePassword(): void {
    window.clearTimeout(passwordSaveTimer.current)
    if (passwordDraft !== null && (passwordValid || password.length === 0)) {
      void persistPassword(password)
    }
  }

  async function saveSettings(): Promise<void> {
    if (await onSave(buildSettingsInput())) {
      setSecretAccessKey('')
      setClearSecret(false)
    }
  }

  return (
    <div className="space-y-6 rounded-xl border bg-card p-4 sm:p-6">
      <div>
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <Cloud className="size-4" aria-hidden="true" />
          云端备份（S3 兼容）
        </h3>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          将供应商配置和两个工具的共通配置打包成一个加密对象上传。AWS S3 可不填端点，Cloudflare R2
          请填写账户的 S3 API 端点。
        </p>
      </div>

      <FieldGroup>
        <ConfigurationCheckbox
          className="rounded-lg border p-3"
          id="cloud-backup-enabled"
          label="启用云端备份"
          hint="关闭后不会执行测试、上传或恢复；本地备份仍按原流程工作。"
          checked={enabled}
          onCheckedChange={(value) => setEnabled(value === true)}
          disabled={busy}
        />

        <div className="grid gap-4">
          <Field>
            <FieldLabel htmlFor="cloud-endpoint">S3 端点（可选）</FieldLabel>
            <Input
              id="cloud-endpoint"
              value={endpoint}
              onChange={(event) => setEndpoint(event.target.value)}
              placeholder="https://s3.amazonaws.com"
              disabled={busy}
              aria-describedby="cloud-endpoint-description"
            />
            <FieldDescription id="cloud-endpoint-description">
              AWS 留空；R2 使用 https://&lt;accountid&gt;.r2.cloudflarestorage.com。
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="cloud-region">区域</FieldLabel>
            <Input
              id="cloud-region"
              value={region}
              onChange={(event) => setRegion(event.target.value)}
              placeholder="us-east-1"
              disabled={busy}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="cloud-bucket">存储桶</FieldLabel>
            <Input
              id="cloud-bucket"
              value={bucket}
              onChange={(event) => setBucket(event.target.value)}
              disabled={busy}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="cloud-prefix">对象前缀</FieldLabel>
            <Input
              id="cloud-prefix"
              value={prefix}
              onChange={(event) => setPrefix(event.target.value)}
              placeholder="ai-switch"
              disabled={busy}
              aria-describedby="cloud-prefix-description"
            />
            <FieldDescription id="cloud-prefix-description">
              每份备份保存为一个带时间戳的加密文件。
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="cloud-retention-count">云端备份保留数量</FieldLabel>
            <Select
              value={String(retentionCount)}
              onValueChange={(value) => setRetentionCount(Number(value))}
              disabled={busy}
            >
              <SelectTrigger
                id="cloud-retention-count"
                className="w-full"
                aria-describedby="cloud-retention-description"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CLOUD_BACKUP_RETENTION.options.map((count) => (
                  <SelectItem key={count} value={String(count)}>
                    {count} 份
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription id="cloud-retention-description">
              下次上传成功后，按云端文件时间戳从旧到新清理，只保留指定数量的最新备份。
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="cloud-access-key">Access Key ID</FieldLabel>
            <Input
              id="cloud-access-key"
              value={accessKeyId}
              onChange={(event) => setAccessKeyId(event.target.value)}
              disabled={busy}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="cloud-secret-key">Secret Access Key</FieldLabel>
            <div className="relative">
              <Input
                id="cloud-secret-key"
                type={showSecret ? 'text' : 'password'}
                value={secretAccessKey}
                onChange={(event) => setSecretAccessKey(event.target.value)}
                placeholder={secretLabel}
                disabled={busy}
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="absolute right-1 top-1/2 -translate-y-1/2"
                onClick={() => setShowSecret((value) => !value)}
                disabled={busy}
                aria-label={showSecret ? '隐藏 Secret Key' : '显示 Secret Key'}
              >
                {showSecret ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
              </Button>
            </div>
            {settings.hasSecret && (
              <ConfigurationCheckbox
                className="mt-1"
                id="cloud-clear-secret"
                label="清除已保存的 Secret Key"
                checked={clearSecret}
                onCheckedChange={(value) => setClearSecret(value === true)}
                disabled={busy || secretAccessKey.length > 0}
              />
            )}
          </Field>
        </div>
      </FieldGroup>

      <div className="flex flex-wrap gap-2 border-t pt-4">
        <Button type="button" onClick={() => void saveSettings()} disabled={busy || !settingsDirty}>
          {pendingKey === 'cloud:settings' ? (
            <Spinner aria-hidden="true" />
          ) : (
            <Save aria-hidden="true" />
          )}
          保存云端设置
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => onTest(buildSettingsInput())}
          disabled={busy || !enabled}
        >
          {pendingKey === 'cloud:test' ? (
            <Spinner aria-hidden="true" />
          ) : (
            <RefreshCw aria-hidden="true" />
          )}
          测试连接
        </Button>
      </div>

      <Alert role="note">
        <Cloud aria-hidden="true" />
        <AlertDescription>
          云端对象只保存经过备份密码加密的内容。密码保存在本机，切换页面或重启后自动填入；换机器恢复时仍需输入相同密码。
        </AlertDescription>
      </Alert>

      <Field data-invalid={passwordInvalid}>
        <FieldLabel htmlFor="cloud-backup-password">云端备份密码</FieldLabel>
        <div className="relative">
          <Input
            id="cloud-backup-password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(event) => changePassword(event.target.value)}
            onBlur={savePassword}
            maxLength={256}
            placeholder="至少 8 个字符"
            disabled={busy}
            className="pr-10"
            aria-invalid={passwordInvalid}
            aria-describedby={`cloud-backup-password-description${passwordInvalid ? ' cloud-backup-password-error' : ''}`}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="absolute right-1 top-1/2 -translate-y-1/2"
            onClick={() => setShowPassword((value) => !value)}
            disabled={busy}
            aria-label={showPassword ? '隐藏备份密码' : '显示备份密码'}
          >
            {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
          </Button>
        </div>
        <FieldDescription id="cloud-backup-password-description">
          输入完成后会自动保存到本机明文设置中；清空输入框可移除已保存的密码。密码不会随备份上传。
        </FieldDescription>
        {passwordInvalid && (
          <FieldError id="cloud-backup-password-error">
            备份密码应为 8 到 256 个字符，且不能包含换行。
          </FieldError>
        )}
      </Field>

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => onUpload(password)} disabled={!canOperate}>
          {pendingKey === 'cloud:upload' ? (
            <Spinner aria-hidden="true" />
          ) : (
            <Upload aria-hidden="true" />
          )}
          加密上传当前配置
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button type="button" variant="outline" disabled={!canOperate}>
              {pendingKey === 'cloud:restore' ? (
                <Spinner aria-hidden="true" />
              ) : (
                <Download aria-hidden="true" />
              )}
              从云端恢复配置
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>从云端覆盖本机配置？</AlertDialogTitle>
              <AlertDialogDescription>
                会使用最新一份云端备份替换本机供应商库和两个工具的共通配置，不会修改 Claude Code 或
                Codex 的实际配置文件。确认前请确保备份密码正确。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction onClick={() => onRestore(password)}>确认恢复</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}

function isValidPassword(password: string): boolean {
  return password.length >= 8 && password.length <= 256 && !/[\r\n]/u.test(password)
}
