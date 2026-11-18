import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { Navigate, RouterProvider, createBrowserRouter } from 'react-router-dom';
import { Shell } from './app/Shell';
import { ToastProvider } from './ui/Overlays';
import './ui/app.css';

/* Chaque page se charge quand on l'ouvre : le premier écran ne télécharge que
   le cadre et sa page, pas toute l'application. */
const ApplyPage = lazy(() => import('./pages/ApplyPage').then((m) => ({ default: m.ApplyPage })));
const BookingPage = lazy(() => import('./pages/BookingPage').then((m) => ({ default: m.BookingPage })));
const MeetPage = lazy(() => import('./pages/MeetPage').then((m) => ({ default: m.MeetPage })));
const KnowledgePage = lazy(() => import('./pages/knowledge/KnowledgePage').then((m) => ({ default: m.KnowledgePage })));
const KnowledgeEntryPage = lazy(() => import('./pages/knowledge/KnowledgeEntryPage').then((m) => ({ default: m.KnowledgeEntryPage })));
const MeetingResultPage = lazy(() => import('./pages/meetings/MeetingResultPage').then((m) => ({ default: m.MeetingResultPage })));
const FundingPage = lazy(() => import('./pages/funding/FundingPage').then((m) => ({ default: m.FundingPage })));
const FundingAnalysisPage = lazy(() => import('./pages/funding/FundingAnalysisPage').then((m) => ({ default: m.FundingAnalysisPage })));
const FunderPage = lazy(() => import('./pages/funding/FunderPage').then((m) => ({ default: m.FunderPage })));
const EditionPage = lazy(() => import('./pages/EditionPage').then((m) => ({ default: m.EditionPage })));
const AuthPage = lazy(() => import('./pages/member/AuthPage').then((m) => ({ default: m.AuthPage })));
const AsStartupPage = lazy(() => import('./pages/member/AsStartupPage').then((m) => ({ default: m.AsStartupPage })));
const MemberPage = lazy(() => import('./pages/member/MemberPage').then((m) => ({ default: m.MemberPage })));
const ReviewPage = lazy(() => import('./pages/member/ReviewPage').then((m) => ({ default: m.ReviewPage })));
const MeetingPage = lazy(() => import('./pages/member/MeetingPage').then((m) => ({ default: m.MeetingPage })));
const PreparePage = lazy(() => import('./pages/member/PreparePage').then((m) => ({ default: m.PreparePage })));
const KpiMeasurePage = lazy(() => import('./pages/member/KpiMeasurePage').then((m) => ({ default: m.KpiMeasurePage })));
const DirectoryPage = lazy(() => import('./pages/directory/DirectoryPage').then((m) => ({ default: m.DirectoryPage })));
const RecordPage = lazy(() => import('./pages/directory/RecordPage').then((m) => ({ default: m.RecordPage })));
const ProgramPage = lazy(() => import('./pages/ProgramPage').then((m) => ({ default: m.ProgramPage })));
const ProgramsPage = lazy(() => import('./pages/ProgramsPage').then((m) => ({ default: m.ProgramsPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const TasksPage = lazy(() => import('./pages/TasksPage').then((m) => ({ default: m.TasksPage })));


const router = createBrowserRouter([
  { path: '/apply/:token', element: <ApplyPage /> },
  { path: '/book/:token', element: <BookingPage /> },
  { path: '/meet/:token', element: <MeetPage /> },
  /* Ce qu'une startup verra sur ses liens, pour CEED — avant même qu'elle soit invitée. */
  { path: '/preview/meet/:blockId/:candidateId', element: <MeetPage /> },
  { path: '/preview/prepare/:blockId/:candidateId', element: <PreparePage /> },
  { path: '/login', element: <AuthPage mode="login" /> },
  { path: '/signup', element: <AuthPage mode="signup" /> },
  { path: '/join', element: <Navigate to="/signup" replace /> },
  { path: '/me', element: <MemberPage /> },
  /* Ouverte par CEED dans un onglet à part : on y lit ce que la startup lira. */
  { path: '/as/:candidateId', element: <AsStartupPage /> },
  { path: '/review/:sessionId', element: <ReviewPage /> },
  { path: '/meeting/:meetingId', element: <MeetingPage /> },
  { path: '/prepare/:meetingId', element: <PreparePage /> },
  { path: '/kpi/:momentId/:candidateId', element: <KpiMeasurePage /> },
  {
    path: '/',
    element: <Shell />,
    children: [
      { index: true, element: <ProgramsPage /> },
      { path: 'programs/:programId', element: <ProgramPage /> },
      { path: 'editions/:editionId', element: <EditionPage /> },
      { path: 'organisations', element: <DirectoryPage kind="org" /> },
      { path: 'individuals', element: <DirectoryPage kind="person" /> },
      { path: 'directory/:recordId', element: <RecordPage /> },
      { path: 'tasks', element: <TasksPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'knowledge', element: <KnowledgePage /> },
      { path: 'knowledge/:entryId', element: <KnowledgeEntryPage /> },
      { path: 'tasks/meetings/:meetingId', element: <MeetingResultPage /> },
      { path: 'funding', element: <FundingPage /> },
      { path: 'funding/funders/:recordId', element: <FunderPage /> },
      { path: 'funding/:analysisId', element: <FundingAnalysisPage /> },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <Suspense fallback={<div className="empty" style={{ padding: 40 }} />}>
        <RouterProvider router={router} />
      </Suspense>
    </ToastProvider>
  </StrictMode>,
);
