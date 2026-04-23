# Sitra Proposal Studio — Claude Context File
# Paste the contents of this file at the start of any Claude conversation
# to give Claude access to the full codebase without uploading a ZIP.
# Update this file whenever new source files are added to the repo.

## INSTRUCTIONS FOR CLAUDE
Fetch the files listed below as needed to understand the codebase before making suggestions.
Repository: https://github.com/nick-walters/sitra-proposal-studio (public)
Base URL: https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/

---

## CORE

https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/App.tsx
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/main.tsx
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/integrations/supabase/types.ts
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/integrations/supabase/client.ts

## PAGES

https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/pages/ProposalEditor.tsx
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/pages/Dashboard.tsx
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/pages/Auth.tsx
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/pages/Index.tsx
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/pages/Feedback.tsx
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/pages/NotFound.tsx
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/pages/admin/BackendAdmin.tsx
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/pages/admin/TemplateAdmin.tsx
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/pages/admin/UserRightsAdmin.tsx
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/pages/admin/FeedbackAdmin.tsx
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/pages/admin/InitialSetup.tsx
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/pages/admin/EvaluationConfigAdmin.tsx

## HOOKS

https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/hooks/useProposalData.ts
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/hooks/useProposalRole.ts
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/hooks/useUserRole.ts
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/hooks/useProposalSections.ts
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/hooks/useAuth.tsx
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/hooks/useBudget.ts
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/hooks/useBudgetRows.ts
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/hooks/useSectionContent.ts
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/hooks/useSectionProgress.ts
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/hooks/useSectionAssignments.ts
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/hooks/useSectionAssignment.ts
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/hooks/useSectionLocking.ts
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/hooks/useSectionVisibility.ts
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/hooks/useSectionComments.ts
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/hooks/useWPDrafts.ts
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/hooks/useB31SectionData.ts
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/hooks/useBlockLocking.ts
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/hooks/useCollaborativeCursors.ts
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/hooks/useNotifications.ts
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/hooks/useParticipantDetails.ts
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/hooks/usePdfExport.ts
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/hooks/useDocxExport.ts
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/hooks/usePageEstimate.ts
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/hooks/useTemplates.ts
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/hooks/useTemplateModifiers.ts
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/hooks/useProposalOnboarding.ts
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/hooks/useProposalReferences.ts
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/hooks/useProposalUserColors.ts
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/hooks/useProposalTemplateCreation.ts
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/hooks/usePinnedProposals.ts
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/hooks/useProfileCompletion.ts
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/hooks/useOCD.ts
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/hooks/useFstpContent.ts
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/hooks/useWPProgress.ts
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/hooks/useWPThemes.ts
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/hooks/useWPColorPalette.ts
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/hooks/useWPDependencies.ts
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/hooks/useWPDraftUndoRedo.ts
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/hooks/useStorageUrl.ts
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/hooks/useColumnResize.ts
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/hooks/useWindowFocus.ts
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/hooks/use-mobile.tsx

## KEY COMPONENTS

https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/components/ProposalAnalyser.tsx
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/components/PanelEvaluator.tsx
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/components/DocumentEditor.tsx
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/components/GeneralInfoForm.tsx
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/components/BudgetPortalSheet.tsx
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/components/BudgetSpreadsheetEnhanced.tsx
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/components/BudgetParticipantForm.tsx
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/components/BudgetValidationEngine.tsx
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/components/ParticipantListView.tsx
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/components/ParticipantDetailForm.tsx
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/components/SectionNavigator.tsx
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/components/SectionProgressDashboard.tsx
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/components/SectionEvaluatePanel.tsx
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/components/WPDraftEditor.tsx
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/components/WPManagementCard.tsx
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/components/B31TablesEditor.tsx
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/components/B31SectionContent.tsx
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/components/B31WPDescriptionTables.tsx
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/components/B31WPListTable.tsx
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/components/B12SectionContent.tsx
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/components/Header.tsx
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/components/ProtectedRoute.tsx
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/components/CollaboratorsDialog.tsx
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/components/WritingAssistantDialog.tsx
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/components/ImpactPathwayGenerator.tsx
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/components/CrossReferenceChecker.tsx
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/components/ProposalScoringAssessment.tsx
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/components/FstpTab.tsx
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/components/EthicsForm.tsx
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/components/TopicInformationPage.tsx
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/components/FigureManager.tsx
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/components/GanttChartFigure.tsx
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/components/CaseManagementCard.tsx
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/components/ProposalMessagingBoard.tsx
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/components/ProposalTaskAllocator.tsx
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/components/ProposalProgressTracker.tsx
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/components/WorkloadDashboard.tsx
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/components/AvailabilityGantt.tsx
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/components/ExportDialog.tsx
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/components/CreateProposalDialog.tsx
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/components/CollaborativeCursors.tsx
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/components/CommentsSidebar.tsx
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/components/NotificationCenter.tsx
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/components/RichTextEditor.tsx
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/components/SaveIndicator.tsx
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/components/admin/GuidelineEditorDialog.tsx
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/components/admin/TemplateModifiersAdmin.tsx
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/components/admin/WorkProgrammeExtensionsAdmin.tsx

## TYPES & LIB

https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/types/proposal.ts
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/types/templates.ts
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/types/participantDetails.ts
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/lib/utils.ts
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/lib/proposalMapper.ts
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/lib/proposalStorage.ts
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/src/lib/b31Population.ts

## EDGE FUNCTIONS

https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/supabase/functions/analyse-proposal/index.ts
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/supabase/functions/propose-evaluation-panel/index.ts
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/supabase/functions/run-panel-evaluation/index.ts
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/supabase/functions/generate-persona/index.ts
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/supabase/functions/writing-assistant/index.ts
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/supabase/functions/analyse-consortium/index.ts
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/supabase/functions/analyse-feedback/index.ts
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/supabase/functions/generate-impact-pathway/index.ts
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/supabase/functions/grammar-check/index.ts
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/supabase/functions/invite-user/index.ts
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/supabase/functions/onboard-user/index.ts
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/supabase/functions/duplicate-proposal/index.ts
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/supabase/functions/fetch-logo/index.ts
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/supabase/functions/lookup-pic/index.ts
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/supabase/functions/lookup-reference/index.ts
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/supabase/functions/ocd-prefill/index.ts
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/supabase/functions/compile-ocds/index.ts
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/supabase/functions/deadline-reminders/index.ts
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/supabase/functions/generate-image/index.ts

## MIGRATIONS (most recent 20 — update as new ones are added)

https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/supabase/migrations/20260413110934_747e6046-8e75-4158-bfd3-958d868f8049.sql
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/supabase/migrations/20260413085851_3cabe8fc-f52d-4604-811e-347750a285b1.sql
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/supabase/migrations/20260412194404_6d2e288e-57dc-4f29-87e2-b06cf9ec93d9.sql
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/supabase/migrations/20260412193440_8611bd44-1d78-4979-98d8-1c7f91edb24b.sql
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/supabase/migrations/20260412181724_e94c1eb6-155e-45fd-a232-97de139c98ed.sql
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/supabase/migrations/20260412181049_e2eaefa9-b2dc-46f8-9af8-626c0815cdad.sql
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/supabase/migrations/20260412175037_3885c801-0288-4039-9a22-9948a7cca11e.sql
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/supabase/migrations/20260412122737_1a1ac510-d497-42d7-909d-9df026ec0c37.sql
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/supabase/migrations/20260412110041_fa137052-3cd0-4e7e-901b-cff57899b587.sql
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/supabase/migrations/20260412110005_94d01b49-7773-489d-8988-fe6374b19246.sql
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/supabase/migrations/20260412082213_1b8e09f8-51e4-431b-8d0c-30795b8c40e1.sql
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/supabase/migrations/20260409104028_808710a0-4171-4f58-8892-899b51494c27.sql
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/supabase/migrations/20260409103649_75dee713-91f1-4925-85b9-e721aa003291.sql
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/supabase/migrations/20260408081739_e5e80b92-fe65-439c-a4e8-ec520b042e5c.sql
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/supabase/migrations/20260407090346_f1acb523-1738-475b-83ea-aeac8ae9ee13.sql
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/supabase/migrations/20260407081622_07ea2d3f-0184-4b84-9fe5-b2b0b8d31169.sql
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/supabase/migrations/20260407074901_6685552c-64bf-45df-8b08-f2e07172d292.sql
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/supabase/migrations/20260402192433_310a3688-546e-4a36-8335-ec4f8cca1726.sql
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/supabase/migrations/20260402175408_18bee49d-373e-41e4-8541-9edba8216a46.sql
https://raw.githubusercontent.com/nick-walters/sitra-proposal-studio/main/supabase/migrations/20260402125605_35d5b7a3-d68d-47e0-96df-a52582fcde7a.sql
