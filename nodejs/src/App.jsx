import React, { useState, useEffect, useCallback } from 'react';

function App() {
  const [todos, setTodos] = useState([]);
  const [newTodo, setNewTodo] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [health, setHealth] = useState(null);

  // Fetch health info (includes timing)
  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      setHealth(data);
    } catch (err) {
      console.error('Failed to fetch health:', err);
    }
  }, []);

  // Fetch all todos
  const fetchTodos = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/todos');
      if (!res.ok) throw new Error('Failed to fetch todos');
      const data = await res.json();
      setTodos(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Add a new todo
  const addTodo = async (e) => {
    e.preventDefault();
    if (!newTodo.trim()) return;

    try {
      const res = await fetch('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTodo.trim() })
      });
      if (!res.ok) throw new Error('Failed to add todo');
      const todo = await res.json();
      setTodos(prev => [todo, ...prev]);
      setNewTodo('');
    } catch (err) {
      setError(err.message);
    }
  };

  // Toggle todo completion
  const toggleTodo = async (id) => {
    try {
      const res = await fetch(`/api/todos/${id}`, { method: 'PATCH' });
      if (!res.ok) throw new Error('Failed to update todo');
      const updated = await res.json();
      setTodos(prev => prev.map(t => t.id === id ? updated : t));
    } catch (err) {
      setError(err.message);
    }
  };

  // Delete a todo
  const deleteTodo = async (id) => {
    try {
      const res = await fetch(`/api/todos/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete todo');
      setTodos(prev => prev.filter(t => t.id !== id));
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    fetchHealth();
    fetchTodos();
  }, [fetchHealth, fetchTodos]);

  const completedCount = todos.filter(t => t.completed).length;
  const pendingCount = todos.length - completedCount;

  return (
    <div className="container">
      <div className="header">
        <h1>Todo App</h1>
        <span className="runtime-badge">
          {health ? `Runtime: Node.js ${health.runtime_version || 'v22'}` : 'Loading...'}
        </span>
      </div>

      {health && (
        <div className="timing-info">
          <span>Uptime: <strong>{health.uptime_formatted}</strong></span>
          <span>Started: <strong>{new Date(health.process_start).toLocaleTimeString()}</strong></span>
        </div>
      )}

      {error && <div className="error">{error}</div>}

      <form className="add-todo" onSubmit={addTodo}>
        <input
          type="text"
          value={newTodo}
          onChange={(e) => setNewTodo(e.target.value)}
          placeholder="What needs to be done?"
          autoFocus
        />
        <button type="submit">Add</button>
      </form>

      <div className="todo-list">
        {loading ? (
          <div className="loading">Loading todos...</div>
        ) : todos.length === 0 ? (
          <div className="empty-state">
            <p>No todos yet. Add one above!</p>
          </div>
        ) : (
          todos.map(todo => (
            <div key={todo.id} className={`todo-item ${todo.completed ? 'completed' : ''}`}>
              <div
                className={`todo-checkbox ${todo.completed ? 'checked' : ''}`}
                onClick={() => toggleTodo(todo.id)}
              />
              <span className="todo-title">{todo.title}</span>
              <button className="todo-delete" onClick={() => deleteTodo(todo.id)}>
                ✕
              </button>
            </div>
          ))
        )}
      </div>

      <div className="stats">
        <span>{pendingCount} pending</span>
        <span>{completedCount} completed</span>
        <span>{todos.length} total</span>
      </div>
    </div>
  );
}

export default App;
