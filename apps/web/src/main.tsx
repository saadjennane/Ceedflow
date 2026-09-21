import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Navigate, RouterProvider, createBrowserRouter } from 'react-router-dom';
import { Shell } from './app/Shell';
import { ApplyPage } from './pages/ApplyPage';
import { BookingPage } from './pages/BookingPage';
import { EditionPage } from './pages/EditionPage';
import { AuthPage } from './pages/member/AuthPage';
import { MemberPage } from './pages/member/MemberPage';
import { ReviewPage } from './pages/member/ReviewPage';
import { DirectoryPage } from './pages/directory/DirectoryPage';
import { RecordPage } from './pages/directory/RecordPage';
import { ProgramPage } from './pages/ProgramPage';
import { ProgramsPage } from './pages/ProgramsPage';
import { SettingsPage } from './pages/SettingsPage';
import { ToastProvider } from './ui/Overlays';
import './ui/app.css';

const router = createBrowserRouter([
  { path: '/apply/:token', element: <ApplyPage /> },
  { path: '/book/:token', element: <BookingPage /> },
  { path: '/login', element: <AuthPage mode="login" /> },
  { path: '/signup', element: <AuthPage mode="signup" /> },
  { path: '/join', element: <Navigate to="/signup" replace /> },
  { path: '/me', element: <MemberPage /> },
  { path: '/review/:sessionId', element: <ReviewPage /> },
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
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <RouterProvider router={router} />
    </ToastProvider>
  </StrictMode>,
);
