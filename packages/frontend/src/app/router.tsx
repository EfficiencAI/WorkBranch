import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, createBrowserRouter } from 'react-router-dom'
import { AppLayout } from './layouts/AppLayout'
import { WorkAssistantLayout } from './layouts/WorkAssistantLayout'
import { RequireAuth } from './guards/RequireAuth'

const DiagramPage = lazy(() =>
  import('../pages/diagram/DiagramPage').then((m) => ({ default: m.DiagramPage })),
)
const AuthPage = lazy(() =>
  import('../pages/workassistant/AuthPage').then((m) => ({ default: m.AuthPage })),
)
const WorkAssistantHomePage = lazy(() =>
  import('../pages/workassistant/WorkAssistantHomePage').then((m) => ({ default: m.WorkAssistantHomePage })),
)
const AssistantWizardPage = lazy(() =>
  import('../pages/workassistant/AssistantWizardPage').then((m) => ({ default: m.AssistantWizardPage })),
)
const AssistantDetailPage = lazy(() =>
  import('../pages/workassistant/AssistantDetailPage').then((m) => ({ default: m.AssistantDetailPage })),
)
const VisitorChatPage = lazy(() =>
  import('../pages/visitor/VisitorChatPage').then((m) => ({ default: m.VisitorChatPage })),
)

function LazyPage({ children }: { children: ReactNode }) {
  return <Suspense fallback={null}>{children}</Suspense>
}

export const router = createBrowserRouter([
  {
    path: '/',
    children: [
      {
        index: true,
        element: <Navigate replace to="/chat" />,
      },
      {
        path: 'chat',
        element: <AppLayout />,
        children: [
          {
            index: true,
            element: (
              <LazyPage>
                <DiagramPage />
              </LazyPage>
            ),
          },
        ],
      },
      {
        path: 'settings',
        element: <AppLayout />,
        children: [
          {
            index: true,
            element: (
              <LazyPage>
                <DiagramPage />
              </LazyPage>
            ),
          },
        ],
      },
      {
        path: 'assistant',
        element: <RequireAuth />,
        children: [
          {
            element: <WorkAssistantLayout />,
            children: [
              {
                index: true,
                element: (
                  <LazyPage>
                    <WorkAssistantHomePage />
                  </LazyPage>
                ),
              },
              {
                path: 'new',
                element: (
                  <LazyPage>
                    <AssistantWizardPage />
                  </LazyPage>
                ),
              },
              {
                path: ':assistantId',
                element: (
                  <LazyPage>
                    <AssistantDetailPage />
                  </LazyPage>
                ),
              },
            ],
          },
        ],
      },
      {
        path: '*',
        element: <Navigate replace to="/chat" />,
      },
    ],
  },
  {
    path: '/auth',
    element: (
      <LazyPage>
        <AuthPage />
      </LazyPage>
    ),
  },
  {
    path: '/s/:shareToken',
    element: (
      <LazyPage>
        <VisitorChatPage />
      </LazyPage>
    ),
  },
])
