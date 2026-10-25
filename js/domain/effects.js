(function () {
  'use strict';

  // Effects are stateless markers; the simulator tells them apart by kind.
  function makeEffect(kind) {
    function Effect() {}
    Effect.prototype.kind = kind;
    Effect.prototype.toJSON = function () { return { kind: kind }; };
    Effect.fromJSON = function (obj) {
      if (!obj || obj.kind !== kind) { throw new Error('Effect.fromJSON: expected kind ' + kind); }
      return new Effect();
    };
    return Effect;
  }

  function makeRegistry(name, classes) {
    function create(kind) {
      if (!Object.prototype.hasOwnProperty.call(classes, kind)) {
        throw new Error(name + ': unknown kind ' + kind);
      }
      return new classes[kind]();
    }
    return {
      kinds: Object.keys(classes),
      create: create,
      fromJSON: function (obj) {
        if (!obj || typeof obj !== 'object') { throw new Error(name + '.fromJSON: invalid data'); }
        return create(obj.kind);
      }
    };
  }

  var ReduceTerm = makeEffect('reduceTerm');
  var ReducePayment = makeEffect('reducePayment');
  var OffsetReducesTerm = makeEffect('offsetReducesTerm');
  var OffsetReducesPayment = makeEffect('offsetReducesPayment');

  MC.domain.ReduceTerm = ReduceTerm;
  MC.domain.ReducePayment = ReducePayment;
  MC.domain.OffsetReducesTerm = OffsetReducesTerm;
  MC.domain.OffsetReducesPayment = OffsetReducesPayment;
  MC.domain.OverpaymentEffects = makeRegistry('OverpaymentEffects', {
    reduceTerm: ReduceTerm,
    reducePayment: ReducePayment
  });
  MC.domain.OffsetEffects = makeRegistry('OffsetEffects', {
    offsetReducesTerm: OffsetReducesTerm,
    offsetReducesPayment: OffsetReducesPayment
  });
})();
