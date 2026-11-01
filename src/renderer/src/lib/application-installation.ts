import type { ManagedApplication } from '@shared/ipc'

interface ApplicationInstallationSource {
  label: string
  managementNotice: string | null
}

export function getApplicationInstallationSource(
  application: ManagedApplication
): ApplicationInstallationSource {
  if (application.npm.available && application.npm.managed) {
    return { label: 'npm 全局安装', managementNotice: null }
  }
  if (application.installation.state === 'not-detected') {
    return { label: '未检测到安装', managementNotice: null }
  }
  if (application.installationSource && application.installation.state === 'installed') {
    return {
      label: application.installationSource.label,
      managementNotice: `无法在此更新或卸载。${application.installationSource.uninstallHint}`
    }
  }
  if (application.installation.state !== 'installed' || !application.npm.available) {
    return {
      label: '来源未确认',
      managementNotice:
        '安装来源尚未确认，无法在此更新或卸载。请先重新检测；如需卸载，请通过原安装方式自行卸载。'
    }
  }
  if (application.npm.packageVersion) {
    return {
      label: 'npm 归属未确认',
      managementNotice:
        '检测到 npm 全局包，但无法确认其与当前 CLI 的对应关系，无法在此更新或卸载。请核对重复安装，并通过原安装方式自行卸载。'
    }
  }
  return {
    label: '其他安装方式',
    managementNotice:
      '当前 CLI 由其他方式安装，无法在此更新或卸载。请通过原安装方式更新或自行卸载。'
  }
}
