import { useEffect, useRef, useState } from 'react'
import { Cloud, RefreshCw, Save, Upload, Download } from 'lucide-react'
import type { CloudBackupSettings, CloudBackupSettingsInput, CloudBackupSummary } from '@shared/ipc'
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
import { PasswordInput } from '@renderer/components/PasswordInput'
import { useStoredSecrets } from '@renderer/hooks/use-stored-secrets'
import { ConfigurationCheckbox } from './ConfigurationCheckbox'

interface CloudBackupPanelProps {
  settings: CloudBackupSettings
  busy: boolean
  pendingKey: string | null
  onSave: (input: CloudBackupSettingsInput) => Promise<boolean>
  onSavePassword: (password: string) => Promise<boolean>
  onTest: (input: CloudBackupSettingsInput) => void
  onUpload: (password: string) => void
  onRestore: (password: string, objectKey?: string) => void
}

const readCloudBackupSecret = (): ReturnType<typeof window.api.getCloudBackupSecret> =>
  window.api.getCloudBackupSecret()

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
  const savedSecret = useStoredSecrets(
    readCloudBackupSecret,
    true,
    '无法读取已保存的 Secret Access Key，请重试或重新打开应用。'
  )
  const [secretDraft, setSecretDraft] = useState<string | null>(null)
  const [clearSecret, setClearSecret] = useState(false)
  const secretAccessKey = clearSecret ? '' : (secretDraft ?? savedSecret.value ?? '')
  const [passwordDraft, setPasswordDraft] = useState<string | null>(null)
  const password = passwordDraft ?? settings.encryptionPassword
  const passwordSaveTimer = useRef<number | undefined>(undefined)
  const [archives, setArchives] = useState<CloudBackupSummary[]>([])
  const [selectedArchive, setSelectedArchive] = useState('')
  const [archiveError, setArchiveError] = useState<string | null>(null)
  const [loadingArchives, setLoadingArchives] = useState(false)
  const [archiveRefresh, setArchiveRefresh] = useState(0)

  useEffect(() => {
    let active = true
    if (!settings.enabled || busy) return
    void Promise.resolve()
      .then(() => {
        if (!active) return null
        setLoadingArchives(true)
        setArchiveError(null)
        return window.api.listCloudBackups()
      })
      .then((result) => {
        if (!active || !result) return
        if (!result.ok) {
          setArchiveError(result.error.message)
          return
        }
        setArchives(result.value)
        setSelectedArchive((previous) =>
          result.value.some((item) => item.objectKey === previous)
            ? previous
            : (result.value[0]?.objectKey ?? '')
        )
      })
      .catch(() => {
        if (active) setArchiveError('无法读取云端存档，请检查连接后刷新。')
      })
      .finally(() => {
        if (active) setLoadingArchives(false)
      })
    return () => {
      active = false
    }
  }, [
    settings.enabled,
    settings.endpoint,
    settings.region,
    settings.bucket,
    settings.prefix,
    settings.accessKeyId,
    settings.hasSecret,
    settings.maskedSecret,
    busy,
    archiveRefresh
  ])

  const settingsDirty =
    enabled !== settings.enabled ||
    endpoint.trim() !== settings.endpoint ||
    region.trim() !== settings.region ||
    bucket.trim() !== settings.bucket ||
    prefix.trim() !== settings.prefix ||
    retentionCount !== settings.retentionCount ||
    accessKeyId.trim() !== settings.accessKeyId ||
    Boolean(secretDraft?.length) ||
    clearSecret
  const passwordValid = isValidPassword(password)
  const passwordInvalid = password.length > 0 && !passwordValid
  const canOperate =
    settings.enabled && !settingsDirty && passwordValid && !busy && !savedSecret.loading

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
        secretDraft && !clearSecret
          ? { mode: 'replace', value: secretDraft }
          : clearSecret
            ? { mode: 'clear' }
            : { mode: 'keep' }
    }
  }

  async function persistPassword(value: string): Promise<void> {
    // Retain the draft so a deferred snapshot cannot briefly restore the old password.
    if (value !== settings.encryptionPassword) await onSavePassword(value)
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
    if (
      passwordDraft !== null &&
      password !== settings.encryptionPassword &&
      (passwordValid || password.length === 0)
    ) {
      void persistPassword(password)
    }
  }

  async function saveSettings(): Promise<void> {
    if (savedSecret.loading) return
    if (await onSave(buildSettingsInput())) {
      if (clearSecret || secretDraft || savedSecret.value !== null) {
        savedSecret.adopt(clearSecret ? '' : secretDraft || savedSecret.value || '')
      }
      setSecretDraft(null)
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
            <PasswordInput
              id="cloud-secret-key"
              label="Secret Access Key"
              value={secretAccessKey}
              onChange={(event) => setSecretDraft(event.target.value)}
              placeholder={
                savedSecret.loading
                  ? '正在读取 Secret Access Key…'
                  : settings.hasSecret
                    ? '留空保留已保存的 Secret Access Key'
                    : '输入 Secret Access Key'
              }
              loading={savedSecret.loading}
              disabled={busy || clearSecret}
              aria-invalid={Boolean(savedSecret.error)}
              aria-describedby={`cloud-secret-description${savedSecret.error ? ' cloud-secret-error' : ''}`}
            />
            <FieldDescription id="cloud-secret-description">
              已保存的密钥自动载入并默认隐藏，可直接编辑；留空保留原值，勾选下方选项才会清除。
            </FieldDescription>
            {savedSecret.error && (
              <>
                <FieldError id="cloud-secret-error">{savedSecret.error}</FieldError>
                <Button
                  type="button"
                  variant="link"
                  className="h-auto justify-start p-0"
                  onClick={savedSecret.reload}
                  disabled={busy}
                >
                  <RefreshCw aria-hidden="true" />
                  重新读取 Secret Access Key
                </Button>
              </>
            )}
            {settings.hasSecret && (
              <ConfigurationCheckbox
                className="mt-1"
                id="cloud-clear-secret"
                label="清除已保存的 Secret Key"
                checked={clearSecret}
                onCheckedChange={(value) => setClearSecret(value === true)}
                disabled={busy || savedSecret.loading || Boolean(secretDraft?.length)}
              />
            )}
          </Field>
        </div>
      </FieldGroup>

      <div className="flex flex-wrap gap-2 border-t pt-4">
        <Button
          type="button"
          onClick={() => void saveSettings()}
          disabled={busy || savedSecret.loading || !settingsDirty}
        >
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
          disabled={busy || savedSecret.loading || !enabled}
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

      <Field
        data-invalid={passwordInvalid}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) savePassword()
        }}
      >
        <FieldLabel htmlFor="cloud-backup-password">云端备份密码</FieldLabel>
        <PasswordInput
          id="cloud-backup-password"
          label="备份密码"
          value={password}
          onChange={(event) => changePassword(event.target.value)}
          maxLength={256}
          placeholder="至少 8 个字符"
          disabled={busy}
          aria-invalid={passwordInvalid}
          aria-describedby={`cloud-backup-password-description${passwordInvalid ? ' cloud-backup-password-error' : ''}`}
        />
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
          保存到云端
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        保存会用本地供应商和通用配置完整覆盖云端当前存档（含 API Key），不会合并云端内容。
      </p>
      <Field>
        <FieldLabel htmlFor="cloud-archive">选择云端存档</FieldLabel>
        <div className="flex gap-2">
          <Select
            value={selectedArchive}
            onValueChange={(value) => setSelectedArchive(value ?? '')}
            disabled={
              busy || settingsDirty || !settings.enabled || loadingArchives || archives.length === 0
            }
          >
            <SelectTrigger id="cloud-archive" className="min-w-0 flex-1">
              <SelectValue placeholder={loadingArchives ? '正在读取存档…' : '云端暂无存档'} />
            </SelectTrigger>
            <SelectContent>
              {archives.map((item) => (
                <SelectItem key={item.objectKey} value={item.objectKey}>
                  {item.current ? '当前存档' : '历史存档'} ·{' '}
                  {new Date(item.createdAt).toLocaleString('zh-CN')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            disabled={busy || loadingArchives || settingsDirty || !settings.enabled}
            onClick={() => setArchiveRefresh((value) => value + 1)}
          >
            刷新存档
          </Button>
        </div>
        {archiveError && <FieldError>{archiveError}</FieldError>}
      </Field>
      <div className="flex flex-wrap gap-2">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              variant="outline"
              disabled={!canOperate || loadingArchives || Boolean(archiveError) || !selectedArchive}
            >
              {pendingKey === 'cloud:restore' ? (
                <Spinner aria-hidden="true" />
              ) : (
                <Download aria-hidden="true" />
              )}
              应用云端版本
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>从云端覆盖本机配置？</AlertDialogTitle>
              <AlertDialogDescription>
                会使用选定存档完整覆盖本机供应商、API Key 和两个工具的通用模板，本地变更不保留。
                覆盖前会创建可恢复的本机快照；不会修改 Claude Code 或 Codex 的实际配置文件。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction onClick={() => onRestore(password, selectedArchive)}>
                确认覆盖
              </AlertDialogAction>
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
