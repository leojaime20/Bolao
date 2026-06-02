export function buildPoolInviteText({ poolName, inviteCode, appUrl, t }) {
  return [
    t('inviteMessageTitle').replace('{poolName}', poolName || t('navBets')),
    '',
    t('inviteMessageIntro'),
    '',
    `${t('poolInviteCode')}: ${inviteCode}`,
    `${t('inviteMessageAccess')}: ${appUrl}`,
    '',
    t('inviteMessageRulesTitle'),
    `- ${t('inviteRuleMatchDeadline')}`,
    `- ${t('inviteRuleScoring')}`,
    `- ${t('inviteRulePodium')}`,
    `- ${t('inviteRulePrizeTie')}`,
    '',
    t('inviteMessageRulesLocation'),
  ].join('\n');
}
