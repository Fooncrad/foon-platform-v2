import test from "node:test";
import assert from "node:assert/strict";
import {normalizeHotelRoomNumber,validHotelRoomNumber} from "../lib/restaurant/hotel-room.mjs";
import {validateResource,ResourceError} from "./restaurant-resource-schema.mjs";
const branch="12345678-1234-1234-1234-123456789abc";
test("hotel rooms normalize Arabic/Persian digits consistently with checkout",()=>{
 for(const value of ["١٠١","۱۰۱","  101  ","١٠١ "])assert.equal(normalizeHotelRoomNumber(value),"101");
 const room=validateResource("hotelRooms",{name:"غرفة ١٠١",status:"active",branchId:branch,data:{roomNumber:"١٠١"}});
 assert.equal(room.data.roomNumber,"101");
 assert.equal(normalizeHotelRoomNumber(" suite ۲ "),"SUITE 2");
});
test("hotel room numbers reject invalid or blank inputs and require a branch",()=>{
 assert.equal(validHotelRoomNumber(normalizeHotelRoomNumber("101/A")),false);
 assert.throws(()=>validateResource("hotelRooms",{name:"Room",status:"active",branchId:branch,data:{roomNumber:"101/A"}}),e=>e instanceof ResourceError&&e.code==="INVALID_roomNumber");
 assert.throws(()=>validateResource("hotelRooms",{name:"Room",status:"active",branchId:null,data:{roomNumber:"101"}}),e=>e instanceof ResourceError&&e.code==="REQUIRED_BRANCH");
});
