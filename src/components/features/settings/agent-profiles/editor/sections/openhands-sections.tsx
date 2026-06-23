import { useTranslation } from "react-i18next";
import { SettingsDropdownInput } from "#/components/features/settings/settings-dropdown-input";
import { SettingsInput } from "#/components/features/settings/settings-input";
import { SettingsSwitch } from "#/components/features/settings/settings-switch";
import { Typography } from "#/ui/typography";
import { I18nKey } from "#/i18n/declaration";
import { McpServerRefsSelect } from "../../mcp-server-refs-select";
import type { AgentProfileForm } from "../use-agent-profile-form";
import { SectionShell } from "./section-shell";

interface SectionProps {
  form: AgentProfileForm;
}

export function ModelSection({ form }: SectionProps) {
  const { t } = useTranslation("openhands");
  return (
    <SectionShell
      title={t(I18nKey.SETTINGS$AGENT_SECTION_MODEL)}
      description={t(I18nKey.SETTINGS$AGENT_SECTION_MODEL_DESC)}
    >
      <SettingsDropdownInput
        testId="agent-profile-llm-ref"
        name="llm-profile-ref"
        label={t(I18nKey.SETTINGS$AGENT_PROFILE_LLM_REF_LABEL)}
        items={form.llmProfiles.map((p) => ({ key: p.name, label: p.name }))}
        selectedKey={form.llmProfileRef || undefined}
        placeholder={t(I18nKey.SETTINGS$AGENT_PROFILE_LLM_REF_REQUIRED)}
        isClearable={false}
        required
        onSelectionChange={(key) => {
          if (key) form.setLlmProfileRef(String(key));
        }}
      />
      <CatalogManageLink i18nKey={I18nKey.SETTINGS$AGENT_MANAGE_LLM_PROFILES} />
    </SectionShell>
  );
}

export function ToolsMcpSection({ form }: SectionProps) {
  const { t } = useTranslation("openhands");
  return (
    <SectionShell
      title={t(I18nKey.SETTINGS$AGENT_SECTION_TOOLS_MCP)}
      description={t(I18nKey.SETTINGS$AGENT_SECTION_TOOLS_MCP_DESC)}
    >
      <McpServerRefsSelect
        availableServers={form.mcpServerNames}
        value={form.mcpServerRefs}
        onChange={form.setMcpServerRefs}
      />
      <CatalogManageLink i18nKey={I18nKey.SETTINGS$AGENT_MANAGE_MCP_SERVERS} />
      <div className="rounded-md border border-dashed border-[#3D4046] p-3">
        <Typography.Text className="text-xs text-[#717888]">
          {t(I18nKey.SETTINGS$AGENT_TOOLS_DEFERRED_NOTE)}
        </Typography.Text>
      </div>
    </SectionShell>
  );
}

const numStr = (v: unknown, fallback = "") =>
  typeof v === "number" && Number.isFinite(v) ? String(v) : fallback;

export function CondenserSection({ form }: SectionProps) {
  const { t } = useTranslation("openhands");
  const enabled = !!form.condenser.enabled;
  return (
    <SectionShell
      title={t(I18nKey.SETTINGS$NAV_CONDENSER)}
      description={t(I18nKey.SETTINGS$PAGE_CONDENSER_SUBLINE)}
    >
      <SettingsSwitch
        testId="agent-profile-condenser-enabled"
        isToggled={enabled}
        onToggle={(v) => form.patchCondenser({ enabled: v })}
      >
        {t(I18nKey.SCHEMA$CONDENSER$ENABLED$LABEL)}
      </SettingsSwitch>

      {enabled && (
        <div className="flex flex-col gap-4 border-l border-[#3D4046] pl-4">
          <SettingsInput
            testId="agent-profile-condenser-max-size"
            label={t(I18nKey.SCHEMA$CONDENSER$MAX_SIZE$LABEL)}
            type="number"
            min={10}
            step={1}
            className="w-full max-w-xs"
            value={numStr(form.condenser.max_size, "240")}
            onChange={(v) => form.patchCondenser({ max_size: Number(v) })}
          />
          <SettingsInput
            testId="agent-profile-condenser-keep-first"
            label={t(I18nKey.SETTINGS$AGENT_CONDENSER_KEEP_FIRST)}
            type="number"
            min={0}
            step={1}
            className="w-full max-w-xs"
            value={numStr(form.condenser.keep_first, "2")}
            onChange={(v) => form.patchCondenser({ keep_first: Number(v) })}
          />
          <SettingsInput
            testId="agent-profile-condenser-max-tokens"
            label={t(I18nKey.SETTINGS$AGENT_CONDENSER_MAX_TOKENS)}
            type="number"
            min={1}
            step={1}
            className="w-full max-w-xs"
            showOptionalTag
            value={numStr(form.condenser.max_tokens)}
            onChange={(v) =>
              form.patchCondenser({ max_tokens: v.trim() ? Number(v) : null })
            }
          />
        </div>
      )}
    </SectionShell>
  );
}

export function PersonalitySection({ form }: SectionProps) {
  const { t } = useTranslation("openhands");
  return (
    <SectionShell
      title={t(I18nKey.SETTINGS$AGENT_SECTION_PERSONALITY)}
      description={t(I18nKey.SETTINGS$AGENT_SECTION_PERSONALITY_DESC)}
    >
      <SettingsInput
        testId="agent-profile-system-suffix"
        label={t(I18nKey.SETTINGS$AGENT_PROFILE_SYSTEM_SUFFIX_LABEL)}
        type="text"
        className="w-full"
        showOptionalTag
        value={form.systemSuffix}
        onChange={form.setSystemSuffix}
      />
    </SectionShell>
  );
}

/** A "Manage ↗" link to the relevant building-block catalog. The catalogs move
 * under the Agents hub later (#1456 step 3); for now this is a hint that the
 * pool of LLM profiles / MCP servers is configured elsewhere, not inline. */
function CatalogManageLink({ i18nKey }: { i18nKey: I18nKey }) {
  const { t } = useTranslation("openhands");
  return (
    <Typography.Text className="text-xs text-[#717888]">
      {t(i18nKey)}
    </Typography.Text>
  );
}
