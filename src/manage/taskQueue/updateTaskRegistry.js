#!/usr/bin/env node

/**
 * Task Registry Update Helper
 * 
 * Provides safe functions for updating parent/child relationships
 * in taskRegistry.json while maintaining bidirectional consistency.
 */

const fs = require('fs');
const path = require('path');
const TaskRegistryValidator = require('./validateTaskRegistry');

class TaskRegistryUpdater {
  constructor(registryPath) {
    this.registryPath = registryPath;
    this.registry = null;
    this.validator = new TaskRegistryValidator(registryPath);
  }

  /**
   * Load the task registry
   */
  loadRegistry() {
    try {
      const registryContent = fs.readFileSync(this.registryPath, 'utf8');
      this.registry = JSON.parse(registryContent);
      return true;
    } catch (error) {
      console.error(`❌ Failed to load registry: ${error.message}`);
      return false;
    }
  }

  /**
   * Save the task registry with proper formatting
   */
  saveRegistry() {
    try {
      const registryContent = JSON.stringify(this.registry, null, 2);
      fs.writeFileSync(this.registryPath, registryContent, 'utf8');
      console.log('✅ Registry saved successfully');
      return true;
    } catch (error) {
      console.error(`❌ Failed to save registry: ${error.message}`);
      return false;
    }
  }

  /**
   * Add a parent-child relationship (bidirectional)
   */
  addParentChildRelationship(parentId, childId) {
    if (!this.registry) {
      console.error('❌ Registry not loaded');
      return false;
    }

    const parentTask = this.registry.tasks[parentId];
    const childTask = this.registry.tasks[childId];

    if (!parentTask) {
      console.error(`❌ Parent task '${parentId}' not found`);
      return false;
    }

    if (!childTask) {
      console.error(`❌ Child task '${childId}' not found`);
      return false;
    }

    // Add child to parent's children array
    if (!parentTask.children) {
      parentTask.children = [];
    }
    if (!parentTask.children.includes(childId)) {
      parentTask.children.push(childId);
      console.log(`✅ Added '${childId}' to '${parentId}' children`);
    }

    // Set parent reference in child
    if (childTask.parent && childTask.parent !== parentId) {
      console.warn(`⚠️  Child '${childId}' already has parent '${childTask.parent}', updating to '${parentId}'`);
    }
    childTask.parent = parentId;
    console.log(`✅ Set '${parentId}' as parent of '${childId}'`);

    return true;
  }

  /**
   * Remove a parent-child relationship (bidirectional)
   */
  removeParentChildRelationship(parentId, childId) {
    if (!this.registry) {
      console.error('❌ Registry not loaded');
      return false;
    }

    const parentTask = this.registry.tasks[parentId];
    const childTask = this.registry.tasks[childId];

    if (!parentTask || !childTask) {
      console.error(`❌ Task not found: parent='${parentId}', child='${childId}'`);
      return false;
    }

    // Remove child from parent's children array
    if (parentTask.children) {
      const childIndex = parentTask.children.indexOf(childId);
      if (childIndex > -1) {
        parentTask.children.splice(childIndex, 1);
        console.log(`✅ Removed '${childId}' from '${parentId}' children`);
      }
    }

    // Remove parent reference from child
    if (childTask.parent === parentId) {
      delete childTask.parent;
      console.log(`✅ Removed parent reference from '${childId}'`);
    }

    return true;
  }

  /**
   * Update a task's parent (handles old and new relationships)
   */
  updateTaskParent(taskId, newParentId) {
    if (!this.registry) {
      console.error('❌ Registry not loaded');
      return false;
    }

    const task = this.registry.tasks[taskId];
    if (!task) {
      console.error(`❌ Task '${taskId}' not found`);
      return false;
    }

    // Remove old parent relationship if exists
    if (task.parent) {
      this.removeParentChildRelationship(task.parent, taskId);
    }

    // Add new parent relationship
    if (newParentId) {
      return this.addParentChildRelationship(newParentId, taskId);
    }

    return true;
  }

  /**
   * Validate registry after updates
   */
  validateAndSave() {
    console.log('\n🔍 Validating updated registry...');
    
    // Create temporary file for validation
    const tempPath = this.registryPath + '.temp';
    const tempContent = JSON.stringify(this.registry, null, 2);
    fs.writeFileSync(tempPath, tempContent, 'utf8');

    // Validate using temporary file
    const tempValidator = new TaskRegistryValidator(tempPath);
    const isValid = tempValidator.validate();

    // Clean up temp file
    fs.unlinkSync(tempPath);

    if (isValid) {
      return this.saveRegistry();
    } else {
      console.error('❌ Validation failed, not saving changes');
      return false;
    }
  }

  /**
   * Batch update multiple relationships
   */
  batchUpdate(operations) {
    if (!this.loadRegistry()) {
      return false;
    }

    console.log(`🔄 Processing ${operations.length} operations...`);

    for (const [index, operation] of operations.entries()) {
      console.log(`\n📝 Operation ${index + 1}/${operations.length}: ${operation.type}`);
      
      let success = false;
      switch (operation.type) {
        case 'addRelationship':
          success = this.addParentChildRelationship(operation.parentId, operation.childId);
          break;
        case 'removeRelationship':
          success = this.removeParentChildRelationship(operation.parentId, operation.childId);
          break;
        case 'updateParent':
          success = this.updateTaskParent(operation.taskId, operation.newParentId);
          break;
        default:
          console.error(`❌ Unknown operation type: ${operation.type}`);
      }

      if (!success) {
        console.error(`❌ Operation ${index + 1} failed, aborting batch update`);
        return false;
      }
    }

    return this.validateAndSave();
  }
}

// CLI usage
if (require.main === module) {
  const registryPath = process.argv[2] || path.join(__dirname, 'taskRegistry.json');
  const updater = new TaskRegistryUpdater(registryPath);

  // Example usage patterns
  const command = process.argv[3];
  
  if (command === 'add-relationship') {
    const parentId = process.argv[4];
    const childId = process.argv[5];
    
    if (!parentId || !childId) {
      console.error('Usage: node updateTaskRegistry.js <registry> add-relationship <parentId> <childId>');
      process.exit(1);
    }

    if (updater.loadRegistry()) {
      updater.addParentChildRelationship(parentId, childId);
      updater.validateAndSave();
    }
  } else if (command === 'validate') {
    // Just validate without changes
    const validator = new TaskRegistryValidator(registryPath);
    const isValid = validator.validate();
    process.exit(isValid ? 0 : 1);
  } else {
    console.log('Task Registry Update Helper');
    console.log('');
    console.log('Usage:');
    console.log('  node updateTaskRegistry.js [registry.json] validate');
    console.log('  node updateTaskRegistry.js [registry.json] add-relationship <parentId> <childId>');
    console.log('');
    console.log('For programmatic usage, import this module and use the TaskRegistryUpdater class.');
  }
}

module.exports = TaskRegistryUpdater;
