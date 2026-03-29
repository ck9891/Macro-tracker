import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./authContext.js";
import { Layout } from "./components/Layout.js";
import { AccountPage } from "./pages/AccountPage.js";
import { HomePage } from "./pages/HomePage.js";
import { RecipesPage } from "./pages/RecipesPage.js";
import { RecipeDetailPage } from "./pages/RecipeDetailPage.js";
import { PlanPage } from "./pages/PlanPage.js";
import { GroceryPage } from "./pages/GroceryPage.js";
import { ImportRecipePage } from "./pages/ImportRecipePage.js";
import { RecipeFormPage } from "./pages/RecipeFormPage.js";
import { ProgressPage } from "./pages/ProgressPage.js";
import { LinkLoginPage } from "./pages/LinkLoginPage.js";
import { LoginPage } from "./pages/LoginPage.js";
import { WeightPage } from "./pages/WeightPage.js";

export default function App() {
  const { state } = useAuth();

  if (state.status === "loading") {
    return (
      <div className="auth-page">
        <p className="loader">Loading…</p>
      </div>
    );
  }

  if (state.status === "signedOut") {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/login/link" element={<LinkLoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Layout
      nav={
        <>
          <NavLink to="/" end className="nav-link">
            Home
          </NavLink>
          <NavLink to="/recipes" className="nav-link">
            Recipes
          </NavLink>
          <NavLink to="/plan" className="nav-link">
            Meal plan
          </NavLink>
          <NavLink to="/grocery" className="nav-link">
            Grocery list
          </NavLink>
          <NavLink to="/progress" className="nav-link">
            Progress
          </NavLink>
          <NavLink to="/weight" className="nav-link">
            Weight
          </NavLink>
          <NavLink to="/import" className="nav-link nav-link-accent">
            Import from photo
          </NavLink>
          <NavLink to="/account" className="nav-link">
            Account
          </NavLink>
        </>
      }
    >
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/recipes" element={<RecipesPage />} />
        <Route path="/recipes/new" element={<RecipeFormPage />} />
        <Route path="/recipes/:id/edit" element={<RecipeFormPage />} />
        <Route path="/recipes/:id" element={<RecipeDetailPage />} />
        <Route path="/plan" element={<PlanPage />} />
        <Route path="/grocery" element={<GroceryPage />} />
        <Route path="/progress" element={<ProgressPage />} />
        <Route path="/weight" element={<WeightPage />} />
        <Route path="/import" element={<ImportRecipePage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
