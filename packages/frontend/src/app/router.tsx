import { Navigate, createBrowserRouter } from 'react-router-dom'
import { AppLayout } from './layouts/AppLayout'
import { ProductShell } from './layouts/ProductShell'
import { WorkAssistantLayout } from './layouts/WorkAssistantLayout'
import {
  AssistantDetailPage,
  AssistantWizardPage,
  AuthPage,
  DiagramPage,
  SettingsPage,
  VisitorChatPage,
  WorkAssistantHomePage,
} from '../pages'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <ProductShell />,
    children: [
      {
        index: true,
        element: <Navigate replace to="/chat" />,
      },
      {
        path: 'chat',
        element: <AppLayout />,
        children: [{ index: true, element: <DiagramPage /> }],
      },
      {
        path: 'settings',
        element: <AppLayout />,
        children: [{ index: true, element: <SettingsPage /> }],
      },
      {
        path: 'assistant',
        element: <WorkAssistantLayout />,
        children: [
          { index: true, element: <WorkAssistantHomePage /> },
          { path: 'new', element: <AssistantWizardPage /> },
          { path: ':assistantId', element: <AssistantDetailPage /> },
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
    element: <AuthPage />,
  },
  {
    path: '/s/:shareToken',
    element: <VisitorChatPage />,
  },
])
