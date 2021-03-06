'use strict'

exports.update = function (req, res, next) {
  var workflow = req.app.utility.workflow(req, res)

  workflow.on('validate', function () {
    if (!req.body.isActive) {
      req.body.isActive = 'no'
    }

    if (!req.body.username) {
      workflow.outcome.errfor.username = 'required'
    } else if (!/^[a-zA-Z0-9-_]+$/.test(req.body.username)) {
      workflow.outcome.errfor.username = "only use letters, numbers, '-', '_'"
    }

    if (!req.body.email) {
      workflow.outcome.errfor.email = 'required'
    } else if (!/^[a-zA-Z0-9\-_.+]+@[a-zA-Z0-9\-_.]+\.[a-zA-Z0-9\-_]+$/.test(req.body.email)) {
      workflow.outcome.errfor.email = 'invalid email format'
    }

    if (workflow.hasErrors()) {
      return workflow.emit('response')
    }

    workflow.emit('duplicateUsernameCheck')
  })

  workflow.on('duplicateUsernameCheck', function () {
    req.app.db.models.User.findOne({ username: req.body.username, _id: { $ne: req.params.id } }, function (err, user) {
      if (err) {
        return workflow.emit('exception', err)
      }

      if (user) {
        workflow.outcome.errfor.username = 'username already taken'
        return workflow.emit('response')
      }

      workflow.emit('duplicateEmailCheck')
    })
  })

  workflow.on('duplicateEmailCheck', function () {
    req.app.db.models.User.findOne({ email: req.body.email.toLowerCase(), _id: { $ne: req.params.id } }, function (err, user) {
      if (err) {
        return workflow.emit('exception', err)
      }

      if (user) {
        workflow.outcome.errfor.email = 'email already taken'
        return workflow.emit('response')
      }

      workflow.emit('patchUser')
    })
  })

  workflow.on('patchUser', function () {
    var fieldsToSet = {
      isActive: req.body.isActive,
      username: req.body.username,
      email: req.body.email.toLowerCase(),
      search: [
        req.body.username,
        req.body.email
      ]
    }
    var options = { new: true }
    req.app.db.models.User.findByIdAndUpdate(req.params.id, fieldsToSet, options, function (err, user) {
      if (err) {
        return workflow.emit('exception', err)
      }

      workflow.emit('patchAdmin', user)
    })
  })

  workflow.on('patchAdmin', function (user) {
    if (user.roles.admin) {
      var fieldsToSet = {
        user: {
          id: req.params.id,
          name: user.username
        }
      }
      var options = { new: true }
      req.app.db.models.Admin.findByIdAndUpdate(user.roles.admin, fieldsToSet, options, function (err, admin) {
        if (err) {
          return workflow.emit('exception', err)
        }

        workflow.emit('patchAccount', user)
      })
    } else {
      workflow.emit('patchAccount', user)
    }
  })

  workflow.on('patchAccount', function (user) {
    if (user.roles.account) {
      var fieldsToSet = {
        user: {
          id: req.params.id,
          name: user.username
        }
      }
      var options = { new: true }
      req.app.db.models.Account.findByIdAndUpdate(user.roles.account, fieldsToSet, options, function (err, account) {
        if (err) {
          return workflow.emit('exception', err)
        }

        workflow.emit('populateRoles', user)
      })
    } else {
      workflow.emit('populateRoles', user)
    }
  })

  workflow.on('populateRoles', function (user) {
    user.populate('roles.admin roles.account', 'name.full', function (err, populatedUser) {
      if (err) {
        return workflow.emit('exception', err)
      }

      workflow.outcome.user = populatedUser
      workflow.emit('response')
    })
  })

  workflow.emit('validate')
}

exports.password = function (req, res, next) {
  var workflow = req.app.utility.workflow(req, res)

  workflow.on('validate', function () {
    if (!req.body.newPassword) {
      workflow.outcome.errfor.newPassword = '請填寫新密碼'
    }

    if (!req.body.confirm) {
      workflow.outcome.errfor.confirm = '請再次填寫新密碼'
    }

    if (req.body.newPassword !== req.body.confirm) {
      workflow.outcome.errors.push('兩密碼內容不相同')
    }

    if (workflow.hasErrors()) {
      return workflow.emit('response')
    }

    workflow.emit('patchUser')
  })

  workflow.on('patchUser', function () {
    req.app.db.models.User.encryptPassword(req.body.newPassword, function (err, hash) {
      if (err) {
        return workflow.emit('exception', err)
      }

      var fieldsToSet = { password: hash }
      var options = { new: true }
      req.app.db.models.User.findByIdAndUpdate(req.params.id, fieldsToSet, options, function (err, user) {
        if (err) {
          return workflow.emit('exception', err)
        }

        user.populate('roles.admin roles.account', 'name.full', function (err, user) {
          if (err) {
            return workflow.emit('exception', err)
          }

          workflow.outcome.user = user
          workflow.outcome.newPassword = ''
          workflow.outcome.confirm = ''
          workflow.emit('response')
        })
      })
    })
  })

  workflow.emit('validate')
}

exports.delete = function (req, res, next) {
  var workflow = req.app.utility.workflow(req, res)

  workflow.on('validate', function () {
    if (!req.user.roles.admin.isMemberOf('root')) {
      workflow.outcome.errors.push('您無法刪除使用者。')
      return workflow.emit('response')
    }

    if (req.user._id === req.params.id) {
      workflow.outcome.errors.push('您無法刪除自己。')
      return workflow.emit('response')
    }

    workflow.emit('deleteAccount')
  })

  workflow.on('deleteAccount', function () {
    req.app.db.models.Account.findByIdAndRemove(req.params.id, function (err, account) {
      if (err) {
        return workflow.emit('exception', err)
      }

      workflow.emit('deleteUser')
    })
  })

  workflow.on('deleteUser', function () {
    req.app.db.models.User.findByIdAndRemove(req.params.id, function (err, user) {
      if (err) {
        return workflow.emit('exception', err)
      }

      workflow.emit('response')
    })
  })

  workflow.emit('validate')
}
