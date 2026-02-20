/**
 * Food Costing & Nutrition Service - Niyam Hospitality (Max Lite)
 * Recipe costing, nutritional info, food cost analysis
 * SQLite-based, no Docker dependencies
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDb, query, run, get, generateId, timestamp } = require('./shared/db');

const app = express();
const PORT = process.env.PORT || 8917;
const SERVICE_NAME = 'food_costing_nutrition';

app.use(cors());
app.use(express.json());

// Serve UI
const uiPath = path.join(__dirname, 'ui', 'dist');
if (fs.existsSync(uiPath)) {
  app.use(express.static(uiPath));
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: SERVICE_NAME, mode: 'lite' });
});

// ============================================
// ADDITIONAL TABLES
// ============================================

async function ensureTables() {
  const db = await initDb();
  
  // Ingredients with costing
  db.run(`
    CREATE TABLE IF NOT EXISTS ingredients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT DEFAULT 'general',
      unit TEXT DEFAULT 'kg',
      cost_per_unit REAL DEFAULT 0,
      supplier_id TEXT,
      par_level REAL DEFAULT 0,
      current_stock REAL DEFAULT 0,
      calories_per_unit REAL DEFAULT 0,
      protein_per_unit REAL DEFAULT 0,
      carbs_per_unit REAL DEFAULT 0,
      fat_per_unit REAL DEFAULT 0,
      fiber_per_unit REAL DEFAULT 0,
      sodium_per_unit REAL DEFAULT 0,
      allergens TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Recipes
  db.run(`
    CREATE TABLE IF NOT EXISTS recipes (
      id TEXT PRIMARY KEY,
      menu_item_id TEXT,
      name TEXT NOT NULL,
      category TEXT,
      description TEXT,
      yield_quantity REAL DEFAULT 1,
      yield_unit TEXT DEFAULT 'portion',
      prep_time_minutes INTEGER DEFAULT 0,
      cook_time_minutes INTEGER DEFAULT 0,
      instructions TEXT,
      target_cost_percent REAL DEFAULT 30,
      selling_price REAL DEFAULT 0,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Recipe ingredients (junction)
  db.run(`
    CREATE TABLE IF NOT EXISTS recipe_ingredients (
      id TEXT PRIMARY KEY,
      recipe_id TEXT NOT NULL,
      ingredient_id TEXT NOT NULL,
      quantity REAL DEFAULT 0,
      unit TEXT,
      prep_notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Cost history for tracking price changes
  db.run(`
    CREATE TABLE IF NOT EXISTS ingredient_cost_history (
      id TEXT PRIMARY KEY,
      ingredient_id TEXT NOT NULL,
      old_cost REAL,
      new_cost REAL,
      change_reason TEXT,
      changed_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Menu item nutrition cache
  db.run(`
    CREATE TABLE IF NOT EXISTS nutrition_cache (
      id TEXT PRIMARY KEY,
      menu_item_id TEXT UNIQUE,
      recipe_id TEXT,
      calories REAL DEFAULT 0,
      protein REAL DEFAULT 0,
      carbs REAL DEFAULT 0,
      fat REAL DEFAULT 0,
      fiber REAL DEFAULT 0,
      sodium REAL DEFAULT 0,
      total_cost REAL DEFAULT 0,
      cost_percent REAL DEFAULT 0,
      calculated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  return db;
}

// ============================================
// INGREDIENTS
// ============================================

app.get('/ingredients', async (req, res) => {
  try {
    await ensureTables();
    const { category, search, low_stock } = req.query;
    
    let sql = `SELECT * FROM ingredients WHERE active = 1`;
    const params = [];
    
    if (category) {
      sql += ` AND category = ?`;
      params.push(category);
    }
    if (search) {
      sql += ` AND name LIKE ?`;
      params.push(`%${search}%`);
    }
    if (low_stock === 'true') {
      sql += ` AND current_stock < par_level`;
    }
    
    sql += ` ORDER BY category, name`;
    
    const ingredients = query(sql, params);
    res.json({ success: true, ingredients });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/ingredients/:id', async (req, res) => {
  try {
    await ensureTables();
    const ingredient = get(`SELECT * FROM ingredients WHERE id = ?`, [req.params.id]);
    if (!ingredient) {
      return res.status(404).json({ success: false, error: 'Ingredient not found' });
    }
    res.json({ success: true, ingredient });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/ingredients', async (req, res) => {
  try {
    await ensureTables();
    const { name, category, unit, cost_per_unit, par_level, calories_per_unit, protein_per_unit, carbs_per_unit, fat_per_unit, fiber_per_unit, sodium_per_unit, allergens } = req.body;
    
    const id = generateId();
    run(`
      INSERT INTO ingredients (id, name, category, unit, cost_per_unit, par_level, calories_per_unit, protein_per_unit, carbs_per_unit, fat_per_unit, fiber_per_unit, sodium_per_unit, allergens, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, name, category || 'general', unit || 'kg', cost_per_unit || 0, par_level || 0, 
        calories_per_unit || 0, protein_per_unit || 0, carbs_per_unit || 0, fat_per_unit || 0, 
        fiber_per_unit || 0, sodium_per_unit || 0, allergens, timestamp()]);
    
    res.json({ success: true, ingredient: { id, name, category, unit, cost_per_unit } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.put('/ingredients/:id', async (req, res) => {
  try {
    await ensureTables();
    const { id } = req.params;
    const { name, category, unit, cost_per_unit, par_level, calories_per_unit, protein_per_unit, carbs_per_unit, fat_per_unit, fiber_per_unit, sodium_per_unit, allergens } = req.body;
    
    // Get old cost for history
    const old = get(`SELECT cost_per_unit FROM ingredients WHERE id = ?`, [id]);
    
    run(`
      UPDATE ingredients SET 
        name = COALESCE(?, name),
        category = COALESCE(?, category),
        unit = COALESCE(?, unit),
        cost_per_unit = COALESCE(?, cost_per_unit),
        par_level = COALESCE(?, par_level),
        calories_per_unit = COALESCE(?, calories_per_unit),
        protein_per_unit = COALESCE(?, protein_per_unit),
        carbs_per_unit = COALESCE(?, carbs_per_unit),
        fat_per_unit = COALESCE(?, fat_per_unit),
        fiber_per_unit = COALESCE(?, fiber_per_unit),
        sodium_per_unit = COALESCE(?, sodium_per_unit),
        allergens = COALESCE(?, allergens),
        updated_at = ?
      WHERE id = ?
    `, [name, category, unit, cost_per_unit, par_level, calories_per_unit, protein_per_unit, 
        carbs_per_unit, fat_per_unit, fiber_per_unit, sodium_per_unit, allergens, timestamp(), id]);
    
    // Log cost change if changed
    if (cost_per_unit && old && old.cost_per_unit !== cost_per_unit) {
      run(`INSERT INTO ingredient_cost_history (id, ingredient_id, old_cost, new_cost, changed_at) VALUES (?, ?, ?, ?, ?)`,
        [generateId(), id, old.cost_per_unit, cost_per_unit, timestamp()]);
    }
    
    res.json({ success: true, message: 'Ingredient updated' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// RECIPES
// ============================================

app.get('/recipes', async (req, res) => {
  try {
    await ensureTables();
    const { category, search } = req.query;
    
    let sql = `SELECT * FROM recipes WHERE active = 1`;
    const params = [];
    
    if (category) {
      sql += ` AND category = ?`;
      params.push(category);
    }
    if (search) {
      sql += ` AND name LIKE ?`;
      params.push(`%${search}%`);
    }
    
    sql += ` ORDER BY category, name`;
    
    const recipes = query(sql, params);
    res.json({ success: true, recipes });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/recipes/:id', async (req, res) => {
  try {
    await ensureTables();
    const recipe = get(`SELECT * FROM recipes WHERE id = ?`, [req.params.id]);
    if (!recipe) {
      return res.status(404).json({ success: false, error: 'Recipe not found' });
    }
    
    // Get ingredients with costs
    const ingredients = query(`
      SELECT ri.*, i.name, i.cost_per_unit, i.unit as ingredient_unit,
             i.calories_per_unit, i.protein_per_unit, i.carbs_per_unit, i.fat_per_unit,
             i.fiber_per_unit, i.sodium_per_unit, i.allergens
      FROM recipe_ingredients ri
      JOIN ingredients i ON ri.ingredient_id = i.id
      WHERE ri.recipe_id = ?
    `, [req.params.id]);
    
    // Calculate totals
    let totalCost = 0;
    let totalCalories = 0, totalProtein = 0, totalCarbs = 0, totalFat = 0, totalFiber = 0, totalSodium = 0;
    const allergenSet = new Set();
    
    ingredients.forEach(ing => {
      const qty = ing.quantity || 0;
      totalCost += qty * (ing.cost_per_unit || 0);
      totalCalories += qty * (ing.calories_per_unit || 0);
      totalProtein += qty * (ing.protein_per_unit || 0);
      totalCarbs += qty * (ing.carbs_per_unit || 0);
      totalFat += qty * (ing.fat_per_unit || 0);
      totalFiber += qty * (ing.fiber_per_unit || 0);
      totalSodium += qty * (ing.sodium_per_unit || 0);
      if (ing.allergens) {
        ing.allergens.split(',').forEach(a => allergenSet.add(a.trim()));
      }
    });
    
    const costPercent = recipe.selling_price > 0 ? (totalCost / recipe.selling_price) * 100 : 0;
    
    res.json({ 
      success: true, 
      recipe: {
        ...recipe,
        ingredients,
        costing: {
          total_cost: Math.round(totalCost * 100) / 100,
          cost_per_portion: Math.round((totalCost / (recipe.yield_quantity || 1)) * 100) / 100,
          cost_percent: Math.round(costPercent * 10) / 10,
          target_cost_percent: recipe.target_cost_percent,
          is_over_target: costPercent > recipe.target_cost_percent
        },
        nutrition: {
          per_portion: {
            calories: Math.round(totalCalories / (recipe.yield_quantity || 1)),
            protein: Math.round((totalProtein / (recipe.yield_quantity || 1)) * 10) / 10,
            carbs: Math.round((totalCarbs / (recipe.yield_quantity || 1)) * 10) / 10,
            fat: Math.round((totalFat / (recipe.yield_quantity || 1)) * 10) / 10,
            fiber: Math.round((totalFiber / (recipe.yield_quantity || 1)) * 10) / 10,
            sodium: Math.round(totalSodium / (recipe.yield_quantity || 1))
          },
          allergens: Array.from(allergenSet)
        }
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/recipes', async (req, res) => {
  try {
    await ensureTables();
    const { name, category, description, yield_quantity, yield_unit, prep_time_minutes, cook_time_minutes, instructions, target_cost_percent, selling_price, menu_item_id } = req.body;
    
    const id = generateId();
    run(`
      INSERT INTO recipes (id, menu_item_id, name, category, description, yield_quantity, yield_unit, prep_time_minutes, cook_time_minutes, instructions, target_cost_percent, selling_price, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, menu_item_id, name, category, description, yield_quantity || 1, yield_unit || 'portion',
        prep_time_minutes || 0, cook_time_minutes || 0, instructions, target_cost_percent || 30, selling_price || 0, timestamp()]);
    
    res.json({ success: true, recipe: { id, name, category } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.put('/recipes/:id', async (req, res) => {
  try {
    await ensureTables();
    const { id } = req.params;
    const { name, category, description, yield_quantity, yield_unit, prep_time_minutes, cook_time_minutes, instructions, target_cost_percent, selling_price } = req.body;
    
    run(`
      UPDATE recipes SET
        name = COALESCE(?, name),
        category = COALESCE(?, category),
        description = COALESCE(?, description),
        yield_quantity = COALESCE(?, yield_quantity),
        yield_unit = COALESCE(?, yield_unit),
        prep_time_minutes = COALESCE(?, prep_time_minutes),
        cook_time_minutes = COALESCE(?, cook_time_minutes),
        instructions = COALESCE(?, instructions),
        target_cost_percent = COALESCE(?, target_cost_percent),
        selling_price = COALESCE(?, selling_price),
        updated_at = ?
      WHERE id = ?
    `, [name, category, description, yield_quantity, yield_unit, prep_time_minutes, 
        cook_time_minutes, instructions, target_cost_percent, selling_price, timestamp(), id]);
    
    res.json({ success: true, message: 'Recipe updated' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Add ingredient to recipe
app.post('/recipes/:id/ingredients', async (req, res) => {
  try {
    await ensureTables();
    const { id } = req.params;
    const { ingredient_id, quantity, unit, prep_notes } = req.body;
    
    const ingredientRecord = generateId();
    run(`
      INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, quantity, unit, prep_notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [ingredientRecord, id, ingredient_id, quantity || 0, unit, prep_notes, timestamp()]);
    
    res.json({ success: true, recipe_ingredient: { id: ingredientRecord, recipe_id: id, ingredient_id, quantity } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Remove ingredient from recipe
app.delete('/recipes/:id/ingredients/:ingredientId', async (req, res) => {
  try {
    await ensureTables();
    run(`DELETE FROM recipe_ingredients WHERE recipe_id = ? AND ingredient_id = ?`, 
      [req.params.id, req.params.ingredientId]);
    res.json({ success: true, message: 'Ingredient removed from recipe' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// MENU ITEM COSTING
// ============================================

app.get('/menu/:menuItemId/costing', async (req, res) => {
  try {
    await ensureTables();
    const { menuItemId } = req.params;
    
    // Get menu item
    const menuItem = get(`SELECT * FROM menu_items WHERE id = ?`, [menuItemId]);
    if (!menuItem) {
      return res.status(404).json({ success: false, error: 'Menu item not found' });
    }
    
    // Get recipe if linked
    const recipe = get(`SELECT * FROM recipes WHERE menu_item_id = ?`, [menuItemId]);
    
    let costing = {
      menu_item: menuItem,
      has_recipe: false,
      total_cost: 0,
      cost_percent: 0,
      margin: 0
    };
    
    if (recipe) {
      costing.has_recipe = true;
      costing.recipe_id = recipe.id;
      
      // Calculate cost from recipe
      const ingredients = query(`
        SELECT ri.quantity, i.cost_per_unit
        FROM recipe_ingredients ri
        JOIN ingredients i ON ri.ingredient_id = i.id
        WHERE ri.recipe_id = ?
      `, [recipe.id]);
      
      let totalCost = 0;
      ingredients.forEach(ing => {
        totalCost += (ing.quantity || 0) * (ing.cost_per_unit || 0);
      });
      
      const costPerPortion = totalCost / (recipe.yield_quantity || 1);
      const sellingPrice = menuItem.price || recipe.selling_price || 0;
      
      costing.total_cost = Math.round(costPerPortion * 100) / 100;
      costing.cost_percent = sellingPrice > 0 ? Math.round((costPerPortion / sellingPrice) * 1000) / 10 : 0;
      costing.margin = Math.round((sellingPrice - costPerPortion) * 100) / 100;
      costing.selling_price = sellingPrice;
    }
    
    res.json({ success: true, costing });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// NUTRITION INFO
// ============================================

app.get('/menu/:menuItemId/nutrition', async (req, res) => {
  try {
    await ensureTables();
    const { menuItemId } = req.params;
    
    // Check cache first
    const cached = get(`SELECT * FROM nutrition_cache WHERE menu_item_id = ?`, [menuItemId]);
    if (cached) {
      return res.json({ success: true, nutrition: cached, cached: true });
    }
    
    // Get recipe
    const recipe = get(`SELECT * FROM recipes WHERE menu_item_id = ?`, [menuItemId]);
    if (!recipe) {
      return res.status(404).json({ success: false, error: 'No recipe found for this menu item' });
    }
    
    // Calculate from ingredients
    const ingredients = query(`
      SELECT ri.quantity, i.*
      FROM recipe_ingredients ri
      JOIN ingredients i ON ri.ingredient_id = i.id
      WHERE ri.recipe_id = ?
    `, [recipe.id]);
    
    let totals = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sodium: 0 };
    
    ingredients.forEach(ing => {
      const qty = ing.quantity || 0;
      totals.calories += qty * (ing.calories_per_unit || 0);
      totals.protein += qty * (ing.protein_per_unit || 0);
      totals.carbs += qty * (ing.carbs_per_unit || 0);
      totals.fat += qty * (ing.fat_per_unit || 0);
      totals.fiber += qty * (ing.fiber_per_unit || 0);
      totals.sodium += qty * (ing.sodium_per_unit || 0);
    });
    
    const yieldQty = recipe.yield_quantity || 1;
    const nutrition = {
      menu_item_id: menuItemId,
      recipe_id: recipe.id,
      calories: Math.round(totals.calories / yieldQty),
      protein: Math.round((totals.protein / yieldQty) * 10) / 10,
      carbs: Math.round((totals.carbs / yieldQty) * 10) / 10,
      fat: Math.round((totals.fat / yieldQty) * 10) / 10,
      fiber: Math.round((totals.fiber / yieldQty) * 10) / 10,
      sodium: Math.round(totals.sodium / yieldQty)
    };
    
    // Cache it
    run(`
      INSERT OR REPLACE INTO nutrition_cache (id, menu_item_id, recipe_id, calories, protein, carbs, fat, fiber, sodium, calculated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [generateId(), menuItemId, recipe.id, nutrition.calories, nutrition.protein, nutrition.carbs, 
        nutrition.fat, nutrition.fiber, nutrition.sodium, timestamp()]);
    
    res.json({ success: true, nutrition, cached: false });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// COST ANALYSIS REPORTS
// ============================================

app.get('/reports/cost-analysis', async (req, res) => {
  try {
    await ensureTables();
    
    const recipes = query(`
      SELECT r.*, m.price as menu_price
      FROM recipes r
      LEFT JOIN menu_items m ON r.menu_item_id = m.id
      WHERE r.active = 1
    `);
    
    const analysis = recipes.map(recipe => {
      const ingredients = query(`
        SELECT ri.quantity, i.cost_per_unit
        FROM recipe_ingredients ri
        JOIN ingredients i ON ri.ingredient_id = i.id
        WHERE ri.recipe_id = ?
      `, [recipe.id]);
      
      let totalCost = 0;
      ingredients.forEach(ing => {
        totalCost += (ing.quantity || 0) * (ing.cost_per_unit || 0);
      });
      
      const costPerPortion = totalCost / (recipe.yield_quantity || 1);
      const sellingPrice = recipe.menu_price || recipe.selling_price || 0;
      const costPercent = sellingPrice > 0 ? (costPerPortion / sellingPrice) * 100 : 0;
      
      return {
        recipe_id: recipe.id,
        recipe_name: recipe.name,
        category: recipe.category,
        cost_per_portion: Math.round(costPerPortion * 100) / 100,
        selling_price: sellingPrice,
        cost_percent: Math.round(costPercent * 10) / 10,
        target_cost_percent: recipe.target_cost_percent,
        variance: Math.round((costPercent - recipe.target_cost_percent) * 10) / 10,
        status: costPercent <= recipe.target_cost_percent ? 'good' : costPercent <= recipe.target_cost_percent + 5 ? 'warning' : 'critical'
      };
    });
    
    // Summary
    const summary = {
      total_recipes: analysis.length,
      avg_cost_percent: Math.round(analysis.reduce((sum, a) => sum + a.cost_percent, 0) / analysis.length * 10) / 10,
      over_target: analysis.filter(a => a.status !== 'good').length,
      critical: analysis.filter(a => a.status === 'critical').length
    };
    
    res.json({ success: true, analysis, summary });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/reports/price-changes', async (req, res) => {
  try {
    await ensureTables();
    const { days = 30 } = req.query;
    
    const changes = query(`
      SELECT h.*, i.name as ingredient_name, i.category
      FROM ingredient_cost_history h
      JOIN ingredients i ON h.ingredient_id = i.id
      WHERE h.changed_at > datetime('now', '-${parseInt(days)} days')
      ORDER BY h.changed_at DESC
    `);
    
    res.json({ success: true, changes });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// STARTUP
// ============================================

async function start() {
  await ensureTables();
  
  app.get('*', (req, res) => {
    if (fs.existsSync(path.join(uiPath, 'index.html'))) {
      res.sendFile(path.join(uiPath, 'index.html'));
    } else {
      res.json({ service: SERVICE_NAME, mode: 'lite', status: 'running' });
    }
  });
  
  app.listen(PORT, () => {
    console.log(`✅ ${SERVICE_NAME} (Lite) running on port ${PORT}`);
  });
}

start();
