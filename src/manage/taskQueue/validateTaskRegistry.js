#!/usr/bin/env node

/**
 * Task Registry Validation Utility
 * 
 * Validates the integrity of parent/child relationships in taskRegistry.json
 * and provides consistency checking for the task management system.
 */

const fs = require('fs');
const path = require('path');

class TaskRegistryValidator {
  constructor(registryPath) {
    this.registryPath = registryPath;
    this.registry = null;
    this.errors = [];
    this.warnings = [];
  }

  /**
   * Load and parse the task registry
   */
  loadRegistry() {
    try {
      const registryContent = fs.readFileSync(this.registryPath, 'utf8');
      this.registry = JSON.parse(registryContent);
      return true;
    } catch (error) {
      this.errors.push(`Failed to load registry: ${error.message}`);
      return false;
    }
  }

  /**
   * Validate parent/child relationship consistency
   */
  validateParentChildRelationships() {
    const tasks = this.registry.tasks;
    
    for (const [taskId, task] of Object.entries(tasks)) {
      // Check if task has parent field
      if (task.parent) {
        this.validateParentReference(taskId, task);
      }

      // Check if task has children field
      if (task.children && Array.isArray(task.children)) {
        this.validateChildrenReferences(taskId, task);
      }
    }
  }

  /**
   * Validate that parent reference is bidirectional
   */
  validateParentReference(taskId, task) {
    const parentId = task.parent;
    const parentTask = this.registry.tasks[parentId];

    if (!parentTask) {
      this.errors.push(`Task '${taskId}' references non-existent parent '${parentId}'`);
      return;
    }

    // Check if parent lists this task as a child
    if (!parentTask.children || !parentTask.children.includes(taskId)) {
      this.errors.push(`Parent '${parentId}' does not list '${taskId}' as a child (bidirectional relationship broken)`);
    }
  }

  /**
   * Validate that children references are bidirectional
   */
  validateChildrenReferences(taskId, task) {
    for (const childId of task.children) {
      const childTask = this.registry.tasks[childId];

      if (!childTask) {
        this.errors.push(`Task '${taskId}' references non-existent child '${childId}'`);
        continue;
      }

      // Check if child lists this task as parent
      if (childTask.parent !== taskId) {
        this.errors.push(`Child '${childId}' does not list '${taskId}' as parent (bidirectional relationship broken)`);
      }
    }
  }

  /**
   * Validate task structure and required fields
   */
  validateTaskStructure() {
    const tasks = this.registry.tasks;
    const requiredFields = ['name', 'categories', 'description'];

    for (const [taskId, task] of Object.entries(tasks)) {
      // Check required fields
      for (const field of requiredFields) {
        if (!task[field]) {
          this.errors.push(`Task '${taskId}' missing required field '${field}'`);
        }
      }

      // Validate categories is array
      if (task.categories && !Array.isArray(task.categories)) {
        this.errors.push(`Task '${taskId}' categories field must be an array`);
      }

      // Check for deprecated 'type' field
      if (task.type) {
        this.warnings.push(`Task '${taskId}' still has deprecated 'type' field: '${task.type}'`);
      }

      // Check for old 'category' field (should be 'categories')
      if (task.category) {
        this.warnings.push(`Task '${taskId}' still has old 'category' field: '${task.category}' (should be 'categories' array)`);
      }
    }
  }

  /**
   * Check for orphaned tasks (no parent and not root-level)
   */
  validateTaskHierarchy() {
    const tasks = this.registry.tasks;
    const rootTasks = ['processAllTasks']; // Known root-level orchestrators

    for (const [taskId, task] of Object.entries(tasks)) {
      const hasParent = !!task.parent;
      const hasChildren = task.children && task.children.length > 0;
      const isRootTask = rootTasks.includes(taskId);

      // Warn about potential orphaned tasks
      if (!hasParent && !hasChildren && !isRootTask) {
        this.warnings.push(`Task '${taskId}' appears to be orphaned (no parent, no children, not a known root task)`);
      }
    }
  }

  /**
   * Run all validations
   */
  validate() {
    console.log('🔍 Validating Task Registry...\n');

    if (!this.loadRegistry()) {
      return false;
    }

    this.validateParentChildRelationships();
    this.validateTaskStructure();
    this.validateTaskHierarchy();

    return this.reportResults();
  }

  /**
   * Report validation results
   */
  reportResults() {
    const hasErrors = this.errors.length > 0;
    const hasWarnings = this.warnings.length > 0;

    if (hasErrors) {
      console.log('❌ VALIDATION ERRORS:');
      this.errors.forEach((error, index) => {
        console.log(`   ${index + 1}. ${error}`);
      });
      console.log('');
    }

    if (hasWarnings) {
      console.log('⚠️  VALIDATION WARNINGS:');
      this.warnings.forEach((warning, index) => {
        console.log(`   ${index + 1}. ${warning}`);
      });
      console.log('');
    }

    if (!hasErrors && !hasWarnings) {
      console.log('✅ Task Registry validation passed! All parent/child relationships are consistent.');
    } else if (!hasErrors) {
      console.log('✅ Task Registry validation passed with warnings.');
    } else {
      console.log('❌ Task Registry validation failed. Please fix the errors above.');
    }

    console.log(`\n📊 Summary: ${this.errors.length} errors, ${this.warnings.length} warnings`);
    
    return !hasErrors;
  }

  /**
   * Generate a relationship report
   */
  generateRelationshipReport() {
    if (!this.registry) {
      console.log('❌ Registry not loaded');
      return;
    }

    console.log('\n🔗 Task Relationship Report:');
    console.log('=' .repeat(50));

    const tasks = this.registry.tasks;
    const processedTasks = new Set();

    // Find root tasks (no parent)
    const rootTasks = Object.entries(tasks)
      .filter(([_, task]) => !task.parent)
      .map(([taskId, _]) => taskId);

    for (const rootTaskId of rootTasks) {
      this.printTaskHierarchy(rootTaskId, 0, processedTasks);
    }

    // Print any remaining unprocessed tasks (orphaned)
    const orphanedTasks = Object.keys(tasks).filter(taskId => !processedTasks.has(taskId));
    if (orphanedTasks.length > 0) {
      console.log('\n🔸 Orphaned Tasks:');
      orphanedTasks.forEach(taskId => {
        console.log(`   • ${taskId} (${tasks[taskId].name})`);
      });
    }
  }

  /**
   * Print task hierarchy recursively
   */
  printTaskHierarchy(taskId, depth, processedTasks) {
    if (processedTasks.has(taskId)) return;
    
    const task = this.registry.tasks[taskId];
    if (!task) return;

    const indent = '  '.repeat(depth);
    const categories = task.categories ? task.categories.join(', ') : 'none';
    console.log(`${indent}• ${taskId} (${task.name}) [${categories}]`);
    
    processedTasks.add(taskId);

    if (task.children) {
      for (const childId of task.children) {
        this.printTaskHierarchy(childId, depth + 1, processedTasks);
      }
    }
  }
}

// CLI usage
if (require.main === module) {
  const registryPath = process.argv[2] || path.join(__dirname, 'taskRegistry.json');
  const validator = new TaskRegistryValidator(registryPath);
  
  const isValid = validator.validate();
  
  if (process.argv.includes('--report')) {
    validator.generateRelationshipReport();
  }
  
  process.exit(isValid ? 0 : 1);
}

module.exports = TaskRegistryValidator;
