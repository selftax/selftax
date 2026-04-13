import { Routes, Route } from 'react-router-dom';
import WelcomePage from './pages/WelcomePage';
import ProfilePage from './pages/ProfilePage';
import DocumentsPage from './pages/DocumentsPage';
import VerifyPage from './pages/VerifyPage';
import AdvisorPage from './pages/AdvisorPage';
import ReviewPage from './pages/ReviewPage';
import ExportPage from './pages/ExportPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<WelcomePage />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/documents" element={<DocumentsPage />} />
      <Route path="/verify" element={<VerifyPage />} />
      <Route path="/advisor" element={<AdvisorPage />} />
      <Route path="/review" element={<ReviewPage />} />
      <Route path="/export" element={<ExportPage />} />
    </Routes>
  );
}
