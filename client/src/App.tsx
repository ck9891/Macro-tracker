import { NavLink, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout.js";
import { HomePage } from "./pages/HomePage.js";
import { RecipesPage } from "./pages/RecipesPage.js";
import { RecipeDetailPage } from "./pages/RecipeDetailPage.js";
import { PlanPage } from "./pages/PlanPage.js";
import { GroceryPage } from "./pages/GroceryPage.js";
import { ImportRecipePage } from "./pages/ImportRecipePage.js";
import { RecipeFormPage } from "./pages/RecipeFormPage.js";

export default function App() {
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
          <NavLink to="/import" className="nav-link nav-link-accent">
            Import from photo
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
        <Route path="/import" element={<ImportRecipePage />} />
      </Routes>
    </Layout>
  );
}
